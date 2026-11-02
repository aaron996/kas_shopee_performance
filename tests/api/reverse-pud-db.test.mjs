import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PUD migration preserves history, round-trips daily/weekly counts, and enforces atomic writes and permissions', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync('supabase/migrations/20261019090000_kas_reverse_history.sql', 'utf8'));
    await db.exec("insert into public.kas_reverse_history(report_date,region,hub,client_name,mau_pu,pud) values ('2026-10-25','HCM','Old','SPE Reverse',3,2)");
    await db.exec(readFileSync('supabase/migrations/20261102035351_reverse_pud_denominator.sql', 'utf8'));
    assert.equal((await db.query('select mau_pud from public.kas_reverse_history')).rows[0].mau_pud, null);
    const makeRow = (day, hub, pud, mau_pud) => ({ report_date: day, region: 'HCM', hub, hub_type: 'BC',
      client_name: 'SPE Reverse', mau_pu: 0, ontime_pu_1st: 0, ontime_pu_opr: 0, pud, mau_pud });
    const replace = rows => db.query("select public.replace_kas_reverse_history('2026-10-26','2026-11-01',$1::jsonb) r", [JSON.stringify(rows)]);
    const rows = [makeRow('2026-10-26','A',1,1), makeRow('2026-11-01','A',0,9),
      makeRow('2026-10-26','B',1,null), makeRow('2026-11-01','B',1,1)];
    const applied = (await replace(rows)).rows[0].r;
    assert.equal(applied.inserted, 4);
    const daily = (await db.query("select public.get_kas_daily_range_compact('reverse','2026-10-26','2026-11-01') r")).rows[0].r;
    const expand = data => data.rows.map(values => Object.fromEntries(data.cols.map((col, i) => [col, values[i]])));
    assert.equal(expand(daily).find(row => row.hub === 'A' && row.report_date === '2026-10-26').mau_pud, 1);
    const exported = (await db.query("select public.get_kas_daily_compact('reverse','2026-10-26','2026-11-01') r")).rows[0].r;
    assert.deepEqual(expand(exported), expand(daily));
    const weekly = (await db.query("select public.get_kas_weekly_compact('reverse',9) r")).rows[0].r;
    const week = expand(weekly).filter(row => row.report_date === '2026-10-26');
    assert.equal(week.find(row => row.hub === 'A').pud, 1);
    assert.equal(week.find(row => row.hub === 'A').mau_pud, 10);
    assert.equal(week.find(row => row.hub === 'B').mau_pud, null, 'partial week must not use a partial denominator');
    assert.equal(expand(weekly).find(row => row.hub === 'Old').mau_pud, null);
    const snapshot = JSON.stringify((await db.query('select * from public.kas_reverse_history order by id')).rows);
    await assert.rejects(replace(rows.map(({mau_pud: _mau_pud, ...row}) => row)), /Missing mau_pud/);
    await assert.rejects(replace([makeRow('2026-11-01','A',2,1)]), /Invalid PUD counts/);
    await assert.rejects(replace([makeRow('2026-11-01','A',0,-1)]), /Invalid PUD counts/);
    await assert.rejects(replace([]), /nonempty/);
    await assert.rejects(replace([rows[0],rows[0]]), /Duplicate key/);
    assert.equal(JSON.stringify((await db.query('select * from public.kas_reverse_history order by id')).rows), snapshot);
    await db.exec('set role authenticated');
    assert.ok((await db.query("select public.get_kas_weekly_compact('reverse',9) r")).rows[0].r.cols.includes('mau_pud'));
    await assert.rejects(replace(rows), /permission denied/);
    await assert.rejects(db.query('select * from public.kas_reverse_history'), /permission denied/);
    await db.exec('set role anon');
    await assert.rejects(db.query("select public.get_kas_weekly_compact('reverse',9)"), /permission denied/);
    await db.exec('reset role');
    const repeated = (await replace(rows)).rows[0].r;
    assert.equal(repeated.deleted, 4);
    assert.equal(repeated.inserted, 4);
  } finally { await db.close(); }
});
