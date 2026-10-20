import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('history KPI RPC compares periods, keeps weighted filters and private-table authorization', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create function public.can_access_app() returns boolean language sql stable as $$ select auth.jwt()->>'email' = 'vinhlt@ghn.vn' $$;
      create function public.gxt_mien_region(text,text) returns text language sql immutable as $$ select $2 $$;
      create table public.kas_pick_history(report_date date,client_name text,region text,hub text,hub_type text,mau_pu numeric,ontime_pu_1st numeric,ontime_pu_opr numeric,synced_at timestamptz);
      create table public.kas_deli_history(report_date date,client_name text,region text,hub text,hub_type text,mau_deli numeric,ontime_deli_1st numeric,ontime_deli_odr numeric,synced_at timestamptz);
      alter table public.kas_pick_history enable row level security;
      alter table public.kas_deli_history enable row level security;
      insert into public.kas_pick_history values
      (current_date-1,'SPE','HCM','Hub A','BC',100,90,80,now()),
      (current_date-1,'SPE','HNO','(HNO) LH Long Biên','BC',900,891,810,now()),
      (current_date-15,'SPE','HCM','Hub A','BC',100,80,70,now()),
      (current_date-1,'SPB','HCM','Hub B','BC',1000,0,0,now());
      insert into public.kas_deli_history values (current_date-1,'SPE','HCM','Hub A','BC',100,95,90,now());
      grant usage on schema auth to authenticated,anon,service_role;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261020050315_chat_kpi_history_timeout.sql', import.meta.url),'utf8'));
    await db.exec(`revoke execute on function public.get_ai_chat_metric(text,text,date,date,text,text[],text[],integer,text), public.get_ai_chat_coverage(text,text) from public,anon;
      grant execute on function public.get_ai_chat_metric(text,text,date,date,text,text[],text[],integer,text), public.get_ai_chat_coverage(text,text) to authenticated;
      select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"vinhlt@ghn.vn","role":"authenticated"}',false);
      set role authenticated;`);
    const metric = async (key='p1st', from=14, to=1, regions=[], types=[], grain='nationwide', sort='worst', limit=1) => (await db.query(`select public.get_ai_chat_metric($1,'SPE',current_date-$2::int,current_date-$3::int,$4,$5,$6,$7,$8) as v`, [key,from,to,grain,regions,types,limit,sort])).rows[0].v;
    assert.equal((await metric()).rows[0].value,98.1);
    assert.equal((await metric('p1st',28,15)).rows[0].value,80);
    assert.equal((await metric('opr')).rows[0].value,89);
    assert.equal((await metric('d1st')).rows[0].value,95);
    assert.equal((await metric('odr')).rows[0].value,90);
    assert.equal((await metric('p1st',14,1,['HNO - KA'],['KA'])).rows[0].value,99);
    assert.deepEqual((await metric('p1st',14,1,['__NO_MATCH__'])).rows,[]);
    assert.equal((await metric('p1st',14,1,[],[],'hub','best',1)).rows[0].entity,'(HNO) LH Long Biên');
    const coverage=(await db.query(`select public.get_ai_chat_coverage('pick','SPE') as v`)).rows[0].v;
    assert.equal(coverage.rowCount,3);
    await assert.rejects(metric('p1st',92,1),/ARGUMENT_NOT_ALLOWED/);
    await assert.rejects(db.query('select * from public.kas_pick_history'),/permission denied/);
    await db.exec(`reset role; select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","email":"outsider@example.com","role":"authenticated"}',false); set role authenticated;`);
    await assert.rejects(metric(),/ACCESS_DENIED/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(metric(),/permission denied/);
  } finally { await db.close(); }
});
