import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { normalizeDashboardRows } from '../../src/utils/dataProcessor.js';
import { expandCompactRows } from '../../src/utils/weeklyKpi.js';
import { aggregateOverviewMtd } from '../../src/utils/overviewMtd.js';

test('MTD RPC matches daily weighted totals and KA/CK/GXT filters; enforces range and access', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        'select coalesce(nullif(current_setting(''request.jwt.claims'',true),''''),''{}'')::jsonb';
      create function auth.uid() returns uuid language sql stable as
        'select (auth.jwt()->>''sub'')::uuid';`);
    for (const file of ['20261012100000_kas_pick_history.sql', '20261012120000_kas_history_deli_fd_read_retention.sql',
      '20261027034650_kas_mtd_compact_rpc.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const claims = async value => db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(value)]);
    const user = { sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated' };
    await claims(user);
    const rpc = async (dataset, from = '2026-10-01', to = '2026-10-26') =>
      (await db.query('select public.get_kas_mtd_compact($1,$2,$3) as data', [dataset, from, to])).rows[0].data;
    const dims = [
      ['HCM', '1', 'Hub A', 'BC', 'SPE'],
      ['HNO', '2', '(HNO) LH Long Biên', 'BC', 'SPB'],
      ['HCM', '23119000', 'CK recognized by ID', 'BC', 'SPE'],
      ['HNO', '3', '(HNO) CK Sample', 'BC', 'SPE'],
      ['DSH', '4', 'Kho Giao Hàng Nặng - Tân Tạo - HCM', 'GXT', 'SPB'],
      ['HCM', '5', 'Key Account Warehouse Ho Chi Minh', 'BC', 'SPE'],
      [null, null, 'Unmapped', null, null],
    ];
    for (const [dataset, metrics] of [['pick', ['p1st', 'popr']], ['deli', ['d1st', 'dodr']], ['fd', ['fd']]]) {
      for (const date of ['2026-09-30', '2026-10-01', '2026-10-12', '2026-10-26', '2026-10-27']) {
        for (const [i, [region, wh_id, hub, hub_type, client_name]] of dims.entries()) {
          const total = i * 100 + Number(date.slice(-2));
          const values = dataset === 'pick' ? [total, total - 1, total - 2]
            : dataset === 'deli' ? [total, total - 3, total - 4] : [total, 1];
          const row = { report_date: date, region, hub_type, client_name,
            ...(dataset === 'fd' ? { wh_id, deliverywh: hub, mau_fd: values[0], fd_hoan_thanh: values[1] }
              : dataset === 'deli' ? { wh_id, hub, mau_deli: values[0], ontime_deli_1st: values[1], ontime_deli_odr: values[2] }
                : { hub, mau_pu: values[0], ontime_pu_1st: values[1], ontime_pu_opr: values[2] }) };
          await db.query(`select public.upsert_kas_${dataset}_history($1::jsonb)`, [JSON.stringify([row])]);
        }
      }
      const daily = normalizeDashboardRows((await db.query(`select report_date::text, region, hub_type, client_name,
        ${dataset === 'fd' ? 'wh_id,deliverywh,mau_fd,fd_hoan_thanh' : dataset === 'deli'
          ? 'wh_id,hub,mau_deli,ontime_deli_1st,ontime_deli_odr' : 'hub,mau_pu,ontime_pu_1st,ontime_pu_opr'}
        from public.kas_${dataset}_history where report_date between '2026-10-01' and '2026-10-26'`)).rows);
      const payload = await rpc(dataset);
      assert.equal(payload.rows.length, dims.length, `${dataset}: collapse days, retain all dimensions`);
      const monthly = normalizeDashboardRows(expandCompactRows(payload.cols, payload.rows).map(row => ({ ...row, report_date: payload.date_to })));
      const filters = [{}, { clientFilter: 'SPE' }, { clientFilter: 'SPB' }, { selectedRegions: [] }, { selectedHubTypes: [] },
        ...[...new Set(daily.map(row => row.region))].map(region => ({ selectedRegions: [region] })),
        ...['BC', 'KA', 'CK', 'GXT', 'Unknown'].map(type => ({ selectedHubTypes: [type] })),
        { clientFilter: 'SPE', selectedRegions: ['HCM - CK', 'HNO - CK'], selectedHubTypes: ['CK'] }];
      for (const metric of metrics) for (const filter of filters) {
        assert.deepEqual(aggregateOverviewMtd(monthly, metric, '2026-10-26', filter),
          aggregateOverviewMtd(daily, metric, '2026-10-26', filter), `${dataset}/${metric}: ${JSON.stringify(filter)}`);
      }
    }
    assert.deepEqual((await rpc('fd', '2026-08-01', '2026-08-31')).rows, []);
    await assert.rejects(rpc('pick', '2026-10-02'), /first day/);
    await assert.rejects(rpc('pick', '2026-09-01'), /first day/);
    await assert.rejects(rpc('pick', null), /first day/);
    await assert.rejects(rpc('ca1'), /Unsupported dataset/);
    await db.exec('set role authenticated');
    assert.equal((await rpc('pick')).rows.length, dims.length);
    await assert.rejects(db.query('select mau_pu from public.kas_pick_history'), /permission denied/);
    await claims({ role: 'authenticated' });
    await assert.rejects(rpc('pick'), /Authentication required/);
    await db.exec('reset role; set role anon');
    await assert.rejects(rpc('pick'), /permission denied/);
    await db.exec('reset role; set role service_role');
    await claims({ role: 'service_role' });
    assert.equal((await rpc('pick')).rows.length, dims.length);
  } finally {
    await db.close();
  }
});
