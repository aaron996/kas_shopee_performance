import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Reverse upsert overwrites matching keys, retains absent rows and is idempotent including NULL keys', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    for (const file of ['20261019090000_kas_reverse_history.sql', '20261102035351_reverse_pud_denominator.sql', '20261102043310_reverse_history_upsert.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const row = (hub, region, pud, mau_pud) => ({report_date:'2026-11-01',hub,region,hub_type:'BC',client_name:'SPE Reverse',mau_pu:0,ontime_pu_1st:0,ontime_pu_opr:0,pud,mau_pud});
    const write = async (rows, fn = 'upsert_kas_reverse_history') => (await db.query(`select public.${fn}('2026-10-19','2026-11-01',$1::jsonb) r`, [JSON.stringify(rows)])).rows[0].r;
    const snapshot = async () => (await db.query('select * from public.kas_reverse_history order by id')).rows;
    assert.equal((await write([row('A','HCM',1,2),row('B',null,1,3)])).written,2);
    const initial = await snapshot();
    const result = await write([row('A','HCM',2,4),row('C','HNO',1,1)]);
    assert.deepEqual(result,{rows:2,written:2,unchanged:0,deleted:0});
    let saved = await snapshot();
    assert.equal(saved.length,3,'absent B is retained');
    assert.equal(saved[0].id,initial[0].id,'overwriting A preserves its row identity');
    assert.equal(Number(saved[0].pud),2);
    assert.equal(Number(saved[0].mau_pud),4);
    assert.equal(Number(saved[1].mau_pud),3);
    const same = await write([row('A','HCM',2,4),row('C','HNO',1,1)]);
    assert.equal(same.written,0); assert.equal(same.unchanged,2);
    assert.deepEqual(await snapshot(),saved,'unchanged rows retain timestamps too');
    await write([row('B',null,2,5)],'replace_kas_reverse_history');
    saved = await snapshot();
    assert.equal(saved.length,3,'legacy RPC name also retains absent rows');
    assert.equal(saved[1].id,initial[1].id,'NULL region conflicts with the existing NULL key');
    assert.equal(Number(saved[1].pud),2);
    const beforeErrors = await snapshot();
    await assert.rejects(write([row('D','HCM',2,1)]),/Invalid PUD/);
    await assert.rejects(write([row('D','HCM',1,1),row('D','HCM',0,1)]),/Duplicate key/);
    await assert.rejects(write([]),/nonempty/);
    await assert.rejects(write([{...row('D','HCM',1,1),report_date:'2026-11-02'}]),/outside window/);
    assert.deepEqual(await snapshot(),beforeErrors);
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(write([row('D','HCM',1,1)]),/permission denied/);
      await assert.rejects(write([row('D','HCM',1,1)],'replace_kas_reverse_history'),/permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
