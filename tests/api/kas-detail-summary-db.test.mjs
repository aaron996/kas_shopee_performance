import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { executeChatTool, CHAT_TOOLS } from '../../server/chat/tools.js';
import { createMcpServer } from '../../server/mcp/server.js';

// KAS-317: chatbot/MCP đọc KPI theo Tỉnh thành và Lane từ bảng chi tiết.
test('chat/MCP metric tools filter and group by province and lane from the detail tables', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
      create function auth.uid() returns uuid language sql stable as
        'select (auth.jwt()->>''sub'')::uuid';`);
    for (const f of ['20261127100000_kas_province_lane_detail.sql', '20261127120000_kas_detail_summary.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    }
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'service_role' })]);
    const call = (sql, params) => db.query(sql, params).then(r => r.rows[0].r);
    const W = ['2026-11-01', '2026-11-30'];
    const up = (fn, rows) => call(`select public.${fn}($1,$2,$3::jsonb) r`, [...W, JSON.stringify(rows)]);
    const deli = (date, hub, province, lane, mau, o1, o2, over = {}) => ({ report_date: date, region: 'HCM', wh_id: '1', hub, hub_type: 'BC',
      client_name: 'SPB', province, lane, mau_deli: mau, ontime_deli_1st: o1, ontime_deli_odr: o2, ...over });
    await up('upsert_kas_deli_detail', [
      deli('2026-11-09', 'H1', 'HCM', 'Nội tỉnh', 100, 90, 95), deli('2026-11-09', 'H1', 'BDG', 'Cận miền', 50, 25, 40),
      deli('2026-11-10', 'H1', 'HCM', 'Nội tỉnh', 100, 80, 90), deli('2026-11-10', 'H2', 'HNO', 'Nội tỉnh', 10, 10, 10, { region: 'HNO' }),
      deli('2026-11-10', 'Kho CK 1', 'HCM', 'Cận miền', 20, 10, 10), deli('2026-11-10', 'H1', 'HCM', 'Nội tỉnh', 999, 1, 1, { client_name: 'SPE' })]);
    await up('upsert_kas_pick_detail', [
      { report_date: '2026-11-09', region: 'HCM', hub: 'H1', hub_type: 'BC', client_name: 'SPB', province: 'HCM', mau_pu: 40, ontime_pu_1st: 30, ontime_pu_opr: 36 },
      { report_date: '2026-11-09', region: 'HCM', hub: 'H1', hub_type: 'BC', client_name: 'SPB', province: 'BDG', mau_pu: 10, ontime_pu_1st: 10, ontime_pu_opr: 10 }]);
    await up('upsert_kas_fd_detail', [{ report_date: '2026-11-09', region: 'HCM', wh_id: '1', deliverywh: 'K1', hub_type: 'BC', client_name: 'SPB',
      province: 'HCM', lane: 'Nội tỉnh', mau_fd: 100, fd_hoan_thanh: 2 }, { report_date: '2026-11-09', region: 'HCM', wh_id: '1', deliverywh: 'K1',
      hub_type: 'BC', client_name: 'SPB', province: 'BDG', lane: 'Cận miền', mau_fd: 100, fd_hoan_thanh: 8 }]);
    await up('upsert_kas_reverse_detail', [{ report_date: '2026-11-09', region: 'HCM', hub: 'R1', hub_type: 'BC', client_name: 'SPE Reverse',
      province: 'HCM', mau_pu: 10, ontime_pu_1st: 5, ontime_pu_opr: 8, pud: 4, mau_pud: 10 }]);

    // Adapter: tools gọi client.rpc(name, args) như PostgREST (tham số có tên).
    const userClient = { rpc: async (name, args) => {
      const keys = Object.keys(args);
      const q = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) r`;
      try { return { data: await call(q, keys.map(k => args[k])), error: null }; } catch (error) { return { data: null, error }; }
    } };
    const base = { metric: 'd1st', client: 'SPB', date_from: '2026-11-01', date_to: '2026-11-30', grain: 'province', regions: [], hub_types: [],
      provinces: [], lanes: [], limit: 20, offset: 0, sort: 'volume_desc' };
    const run = (name, args) => executeChatTool({ name, arguments: { ...base, ...args } }, { userClient });
    const byEntity = result => Object.fromEntries(result.data.rows.map(r => [r.entity, r]));

    // Nhóm theo province: client SPB, SPE bị loại.
    let r = await run('get_metric_summary', {});
    assert.deepEqual(Object.keys(byEntity(r)).sort(), ['BDG', 'HCM', 'HNO']);
    assert.equal(byEntity(r).HCM.volume, 220); assert.equal(byEntity(r).HCM.ontime, 180);
    assert.equal(byEntity(r).HCM.value, Math.round(10000 * 180 / 220) / 100);
    assert.equal(r.data.benchmark, 'none'); assert.equal(r.data.scope.grain, 'province');
    // Lọc tỉnh, nhóm theo lane
    r = await run('get_metric_summary', { grain: 'lane', provinces: ['HCM'] });
    assert.equal(byEntity(r)['Nội tỉnh'].volume, 200); assert.equal(byEntity(r)['Cận miền'].volume, 20);
    assert.deepEqual(r.data.scope.provinces, ['HCM']);
    r = await run('get_metric_summary', { grain: 'nationwide', lanes: ['Cận miền'], metric: 'odr' });
    assert.equal(r.data.rows[0].volume, 70); assert.equal(r.data.rows[0].ontime, 50);
    // Tên CK/KHL do app chuẩn hoá: hub chứa "CK" ở HCM thành vùng HCM - CK
    r = await run('get_metric_summary', { grain: 'region', regions: ['HCM - CK'], provinces: ['HCM'] });
    assert.deepEqual(r.data.rows.map(x => x.entity), ['HCM - CK']); assert.equal(r.data.rows[0].volume, 20);
    // Latest dùng ngày mới nhất của bảng chi tiết
    r = await run('get_latest_metric_summary', { grain: 'nationwide', provinces: ['HCM'] });
    assert.equal(r.data.dataAsOf, '2026-11-10'); assert.equal(r.data.rows[0].volume, 120);
    // Pick: lane không có
    await assert.rejects(run('get_metric_summary', { metric: 'p1st', lanes: ['x'] }), /Lane chỉ có ở D1ST, ODR và FD/);
    r = await run('get_metric_summary', { metric: 'opr', provinces: ['BDG'], grain: 'hub' });
    assert.equal(r.data.rows[0].volume, 10);
    // FD: càng thấp càng tốt; worst = FD cao nhất
    r = await run('get_metric_summary', { metric: 'fd', grain: 'province', sort: 'worst' });
    assert.deepEqual(r.data.rows.map(x => x.entity), ['BDG', 'HCM']); assert.equal(r.data.rows[0].meetsKpi, false);
    assert.equal(r.data.direction, 'lower_is_better');
    // Reverse
    r = await run('get_metric_summary', { metric: 'p1st', client: 'SPE Reverse', grain: 'province' });
    assert.equal(r.data.rows[0].entity, 'HCM'); assert.equal(r.data.rows[0].volume, 10);
    await assert.rejects(run('get_metric_summary', { metric: 'd1st', client: 'SPE Reverse', grain: 'province' }), /Reverse hiện chỉ có dữ liệu Pickup/);
    // Không có dữ liệu: noData, không phải 0%
    r = await run('get_metric_summary', { provinces: ['Không tồn tại'], grain: 'nationwide' });
    assert.equal(r.data.noData, true); assert.equal(r.data.rows.length, 0);
    // Trend theo tỉnh
    const t = await run('get_metric_trend', { date_from: '2026-11-09', date_to: '2026-11-10', provinces: ['HCM'] });
    assert.deepEqual(t.data.rows.map(x => [x.date, x.volume]), [['2026-11-09', 100], ['2026-11-10', 120]]);
    // Drivers theo tỉnh
    const d = await run('get_metric_change_drivers', { current_from: '2026-11-10', current_to: '2026-11-10', previous_from: '2026-11-09', previous_to: '2026-11-09', grain: 'province' });
    assert.equal(d.data.scope.grain, 'province'); assert.ok(d.data.analysis);
    // Không lọc: vẫn đi qua RPC hub-level cũ (không đụng bảng chi tiết)
    const calls = [];
    const spy = { rpc: async name => { calls.push(name); return { data: { rows: [], totalEntities: 0 }, error: null }; } };
    await executeChatTool({ name: 'get_metric_summary', arguments: { ...base, grain: 'region' } }, { userClient: spy });
    assert.deepEqual(calls, ['get_ai_chat_metric'], 'no filter keeps the hub-level RPC');

    // Schema: tool chat bắt buộc đủ khoá (strict), MCP thì provinces/lanes là tuỳ chọn.
    for (const name of ['get_metric_summary', 'get_latest_metric_summary', 'get_metric_trend', 'get_metric_change_drivers']) {
      const tool = CHAT_TOOLS.find(x => x.name === name);
      assert.ok(tool.parameters.required.includes('provinces') && tool.parameters.required.includes('lanes'), `${name} strict required`);
      assert.deepEqual(Object.keys(tool.parameters.properties).sort(), [...tool.parameters.required].sort(), `${name} strict keys`);
    }
    const listed = await createMcpServer({ serviceClient: userClient })._requestHandlers.get('tools/list')({ method: 'tools/list', params: {} }, {});
    const summary = listed.tools.find(x => x.name === 'get_metric_summary');
    assert.ok(summary.inputSchema.properties.provinces && summary.inputSchema.properties.lanes);
    assert.equal(summary.inputSchema.required.includes('provinces'), false);
    assert.equal(summary.inputSchema.required.includes('metric'), true);
    // MCP không truyền provinces/lanes vẫn chạy
    const noFilters = { ...base, grain: 'province' };
    delete noFilters.provinces; delete noFilters.lanes;
    const viaMcp = await executeChatTool({ name: 'get_metric_summary', arguments: noFilters }, { userClient });
    assert.equal(viaMcp.data.rows.length, 3);
  } finally {
    await db.close();
  }
});
