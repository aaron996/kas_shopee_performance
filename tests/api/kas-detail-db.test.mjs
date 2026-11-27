import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expandCompactRows } from '../../src/utils/weeklyKpi.js';

// KAS-317: bảng chi tiết province/lane. Tổng không lọc phải khớp hub-level; lọc theo province/lane
// đúng; upsert chạy lại là no-op, từ chối khoá trùng / ngoài cửa sổ.
test('KAS detail: upsert, filters, grains and unfiltered totals', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
      create function auth.uid() returns uuid language sql stable as
        'select (auth.jwt()->>''sub'')::uuid';`);
    await db.exec(readFileSync('supabase/migrations/20261127100000_kas_province_lane_detail.sql', 'utf8'));
    const call = async (sql, params) => (await db.query(sql, params)).rows[0].r;
    const W = ['2026-11-09', '2026-11-22'];
    const deli = (date, province, lane, mau, o1, o2, hub = 'H1') => ({
      report_date: date, region: 'HCM', wh_id: '1', hub, hub_type: 'BC', client_name: 'SPE',
      province, lane, mau_deli: mau, ontime_deli_1st: o1, ontime_deli_odr: o2 });
    const rows = [
      deli('2026-11-09', 'HCM', 'Nội tỉnh', 10, 8, 9), deli('2026-11-09', 'HCM', 'Cận miền', 5, 4, 4),
      deli('2026-11-09', 'BDG', 'Nội tỉnh', 7, 6, 7), deli('2026-11-10', 'HCM', 'Nội tỉnh', 3, 3, 3),
      deli('2026-11-16', 'BDG', null, 2, 1, 2)
    ];
    const up = r => call('select public.upsert_kas_deli_detail($1,$2,$3::jsonb) r', [...W, JSON.stringify(r)]);
    assert.deepEqual(await up(rows), { rows: 5, written: 5, unchanged: 0 });
    assert.deepEqual(await up(rows), { rows: 5, written: 0, unchanged: 5 }, 'rerun is a no-op');
    await assert.rejects(up([rows[0], rows[0]]), /Duplicate key in batch/);
    await assert.rejects(up([deli('2026-12-01', 'HCM', 'x', 1, 1, 1)]), /outside window/);
    await assert.rejects(up([deli('2026-11-09', 'HCM', 'x', -1, 0, 0)]), /Negative/);

    // Chưa đăng nhập bị từ chối; đăng nhập thì đọc được.
    await db.query("select set_config('request.jwt.claims', '{}', false)");
    await assert.rejects(db.query("select public.get_kas_detail_compact('deli','day')"), /Authentication required/);
    await db.query("select set_config('request.jwt.claims', $1, false)",
      [JSON.stringify({ sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated' })]);
    const get = (grain, from, to, p, l, ds = 'deli') =>
      call('select public.get_kas_detail_compact($1,$2,$3,$4,$5,$6) r', [ds, grain, from, to, p, l]);
    const total = (data, col) => expandCompactRows(data.cols, data.rows).reduce((a, r) => a + Number(r[col]), 0);

    const all = await get('day', W[0], W[1], null, null);
    assert.equal(total(all, 'mau_deli'), 27, 'unfiltered detail total equals the sum of source rows');
    assert.equal(total(all, 'ontime_deli_1st'), 22);
    assert.deepEqual(all.weeks, ['2026-11-09', '2026-11-10', '2026-11-16']);
    assert.equal(all.cols.includes('best_l6w_vol_1st'), false, 'no benchmark columns');

    assert.equal(total(await get('day', W[0], W[1], ['BDG'], null), 'mau_deli'), 9);
    assert.equal(total(await get('day', W[0], W[1], ['HCM'], ['Nội tỉnh']), 'mau_deli'), 13);
    assert.equal(total(await get('day', W[0], W[1], ['HCM', 'BDG'], ['Cận miền']), 'mau_deli'), 5);
    assert.equal(total(await get('day', W[0], W[1], null, ['Nội tỉnh']), 'mau_deli'), 20, 'lane only');

    const week = await get('week', W[0], W[1], null, null);
    assert.deepEqual(week.weeks, ['2026-11-09', '2026-11-16']);
    const w1 = expandCompactRows(week.cols, week.rows).find(r => r.report_date === '2026-11-09');
    assert.equal(Number(w1.mau_deli), 25);
    assert.equal(Number(w1.days), 2);
    const month = await get('month', W[0], W[1], null, null);
    assert.deepEqual(month.weeks, ['2026-11-01']);
    assert.equal(total(month, 'mau_deli'), 27);

    // Mặc định (không truyền ngày): lấy theo ngày mới nhất của bảng.
    assert.equal(total(await get('week', null, null, null, null), 'mau_deli'), 27);
    await assert.rejects(get('day', '2026-01-01', '2026-11-22', null, null), /too long/);

    const options = await call("select public.get_kas_detail_options('deli') r");
    assert.deepEqual(options.provinces, ['BDG', 'HCM']);
    assert.deepEqual(options.lanes, ['Cận miền', 'Nội tỉnh']);
    assert.equal(options.max_date, '2026-11-16');

    // Pick/Reverse không có lane: lane bị bỏ qua.
    const pickRow = (province, mau) => ({ report_date: '2026-11-09', region: 'HCM', hub: 'H1', hub_type: 'BC',
      client_name: 'SPE', province, mau_pu: mau, ontime_pu_1st: mau - 1, ontime_pu_opr: mau - 1 });
    await call('select public.upsert_kas_pick_detail($1,$2,$3::jsonb) r',
      [...W, JSON.stringify([pickRow('HCM', 4), pickRow('BDG', 6)])]);
    assert.equal(total(await get('day', W[0], W[1], null, ['bất kỳ'], 'pick'), 'mau_pu'), 10);
    assert.equal(total(await get('day', W[0], W[1], ['BDG'], null, 'pick'), 'mau_pu'), 6);
    assert.deepEqual((await call("select public.get_kas_detail_options('pick') r")).lanes, []);

    const rev = (province, pud, mau_pud) => ({ report_date: '2026-11-09', region: 'HCM', hub: 'H1', hub_type: 'BC',
      client_name: 'SPE Reverse', province, mau_pu: 1, ontime_pu_1st: 1, ontime_pu_opr: 1, pud, mau_pud });
    await assert.rejects(call('select public.upsert_kas_reverse_detail($1,$2,$3::jsonb) r',
      [...W, JSON.stringify([rev('HCM', 3, 2)])]), /Invalid counts/);
    await call('select public.upsert_kas_reverse_detail($1,$2,$3::jsonb) r',
      [...W, JSON.stringify([rev('HCM', 1, 2), rev('BDG', 2, 3)])]);
    const r = await get('day', W[0], W[1], null, null, 'reverse');
    assert.equal(total(r, 'pud'), 3); assert.equal(total(r, 'mau_pud'), 5);

    const fd = (province, lane, mau, done) => ({ report_date: '2026-11-09', region: 'HCM', wh_id: '1', deliverywh: 'K1',
      hub_type: 'BC', client_name: 'SPE', province, lane, mau_fd: mau, fd_hoan_thanh: done });
    await call('select public.upsert_kas_fd_detail($1,$2,$3::jsonb) r',
      [...W, JSON.stringify([fd('HCM', 'a', 5, 2), fd('HCM', 'b', 3, 1), fd('BDG', 'a', 2, 2)])]);
    assert.equal(total(await get('day', W[0], W[1], ['HCM'], ['a'], 'fd'), 'mau_fd'), 5);
    assert.equal(total(await get('day', W[0], W[1], null, null, 'fd'), 'fd_hoan_thanh'), 5);

    // Quyền: authenticated không đọc trực tiếp bảng và không gọi upsert.
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.kas_deli_detail'), /permission denied/);
    await assert.rejects(db.query("select public.upsert_kas_deli_detail('2026-11-09','2026-11-09','[]')"), /permission denied/);
    await db.exec('reset role');

    await call('select public.upsert_kas_deli_detail($1,$2,$3::jsonb) r',
      ['2026-01-01', '2026-01-01', JSON.stringify([deli('2026-01-01', 'HCM', 'x', 1, 1, 1)])]);
    const pruned = await call('select public.prune_kas_detail(90) r');
    assert.equal(pruned.deli, 1, 'only the row older than the 90-day cutoff is pruned');
    await assert.rejects(call('select public.prune_kas_detail(30) r'), /at least 70/);
  } finally {
    await db.close();
  }
});
