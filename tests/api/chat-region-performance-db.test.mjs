import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = async name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('optimized KPI matches the original RPC and normalizes GXT once per distinct location', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create function public.can_access_app() returns boolean language sql stable as $$ select auth.jwt()->>'email' = 'vinhlt@ghn.vn' $$;
      create table public.kas_pick_history(report_date date,client_name text,region text,hub text,hub_type text,mau_pu numeric,ontime_pu_1st numeric,ontime_pu_opr numeric,synced_at timestamptz);
      create table public.kas_deli_history(report_date date,client_name text,region text,hub text,hub_type text,mau_deli numeric,ontime_deli_1st numeric,ontime_deli_odr numeric,synced_at timestamptz);
      alter table public.kas_pick_history enable row level security;
      alter table public.kas_deli_history enable row level security;
      insert into public.kas_pick_history
      select date '2026-10-20'-d, client, region, hub, hub_type,
        case when hub='Zero' then 0 else d*10 end,
        case when hub='Zero' then 0 else d*8 end,
        case when hub='Zero' then null else d*7 end, timestamptz '2026-10-20 00:00:00Z'
      from generate_series(1,14) d cross join (values ('SPB'),('spe')) c(client)
      cross join (values
        ('HNO','Tân Tạo - HCM','GXT'),
        ('HCM','Kho - Hà Nội','GXT'),
        ('TTB','Kho - Đà Nẵng','GXT'),
        ('HCM - GXT','Unknown','GXT'),
        ('Unknown','Unmapped',' GXT '),
        ('HCM','Key Account Warehouse Ho Chi Minh','BC'),
        ('HNO','(HNO) LH Long Biên','BC'),
        ('HCM','KA other','KA'),
        ('HCM','Zero','BC'),
        (null,null,null)) l(region,hub,hub_type);
      insert into public.kas_deli_history select * from public.kas_pick_history;
      grant usage on schema auth to authenticated,anon,service_role;
      select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"vinhlt@ghn.vn","role":"authenticated"}',false);`);
    const oldGxt = (await migration('20261009150000_ai_chat_gxt_mien_region.sql')).split('create or replace function public.get_ai_chat_metric')[0];
    await db.exec(oldGxt);
    await db.exec(await migration('20261020050315_chat_kpi_history_timeout.sql'));
    await db.exec(`revoke execute on function public.get_ai_chat_metric(text,text,date,date,text,text[],text[],integer,text) from public,anon;
      grant execute on function public.get_ai_chat_metric(text,text,date,date,text,text[],text[],integer,text) to authenticated;
      set role authenticated;`);
    const cases = [
      ['d1st','SPB','2026-10-13','2026-10-19','region',[],[],15,'volume_desc'],
      ['d1st','SPB','2026-10-06','2026-10-12','region',[],[],15,'volume_desc'],
      ['odr','SPB','2026-10-06','2026-10-19','hub',['GXT - Nam','GXT - Bắc'],['GXT'],15,'worst'],
      ['opr','SPE','2026-10-06','2026-10-19','nationwide',[],[],1,'worst'],
      ['p1st','ALL','2026-10-06','2026-10-19','hub',[],[],5,'best'],
      ['p1st','SPE','2026-10-06','2026-10-19','region',['HNO - KA','HCM - KA'],['KA'],15,'worst'],
      ['d1st','SPB','2026-10-06','2026-10-19','region',['__NO_MATCH__'],[],15,'worst'],
      ['d1st','SPB','2026-10-06','2026-10-19','region',[],['__NO_MATCH__'],15,'worst'],
      ['odr','SPB','2026-10-06','2026-10-19','hub',['Unknown'],[],50,'worst'],
      ['d1st','SPB','2026-09-01','2026-09-07','nationwide',[],[],1,'worst'],
    ];
    const query = args => db.query('select public.get_ai_chat_metric($1,$2,$3,$4,$5,$6,$7,$8,$9) as v',args).then(r=>r.rows[0].v);
    const before = [];
    for (const args of cases) before.push(await query(args));
    await db.exec('reset role;');
    await db.exec(await migration('20261020144354_chat_metric_region_normalization.sql'));
    await db.exec('set role authenticated;');
    for (const [i,args] of cases.entries()) assert.deepEqual(await query(args),before[i],JSON.stringify(args));
    assert.equal(before[0].rows.find(r=>r.entity==='GXT - Nam').value,80);
    assert.equal(before[0].rows.find(r=>r.entity==='GXT - Bắc').value,80);
    assert.equal(before[0].rows.find(r=>r.entity==='GXT - Trung').value,80);
    assert.equal(before[4].rows.find(r=>r.entity==='Zero')?.value ?? null,null);

    // Work grows with distinct hub/location combinations, not days or client
    // rows. A sequence counts real helper calls without a flaky wall-time test.
    await db.exec(`reset role;
      alter function public.gxt_mien_region(text,text) rename to counted_gxt_implementation;
      create sequence gxt_calls;
      create function public.gxt_mien_region(text,text) returns text language plpgsql volatile as $$
      begin perform nextval('public.gxt_calls'); return public.counted_gxt_implementation($1,$2); end $$;`);
    await query(['d1st','ALL','2026-10-06','2026-10-19','region',['GXT - Nam'],[],15,'volume_desc']);
    assert.equal(Number((await db.query('select last_value from gxt_calls')).rows[0].last_value),5);
    await db.exec(`select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","email":"outsider@example.com","role":"authenticated"}',false); set role authenticated;`);
    await assert.rejects(query(cases[0]),/ACCESS_DENIED/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(query(cases[0]),/permission denied/);
  } finally { await db.close(); }
});
