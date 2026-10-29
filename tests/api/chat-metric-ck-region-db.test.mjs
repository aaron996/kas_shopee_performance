import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = async name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('CK hubs get their own vùng in HCM/HNO (and hub_type elsewhere), KA still wins over CK', async () => {
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
      select date '2026-10-28', 'SPB', region, hub, hub_type, volume, volume, volume, timestamptz '2026-10-29 00:00:00Z'
      from (values
        ('HCM', 'Kho CK Tân Bình', 'BC', 100),
        ('HNO', 'CK Long Biên', 'BC', 50),
        ('DNB', 'Kho CK Biên Hòa', 'BC', 30),
        ('HCM', 'KA CK Test', 'KA', 20),
        ('HCM', 'Zero', 'BC', 10)
      ) l(region,hub,hub_type,volume);
      insert into public.kas_deli_history select * from public.kas_pick_history;
      grant usage on schema auth to authenticated,anon,service_role;
      select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"vinhlt@ghn.vn","role":"authenticated"}',false);`);
    const oldGxt = (await migration('20261009150000_ai_chat_gxt_mien_region.sql')).split('create or replace function public.get_ai_chat_metric')[0];
    await db.exec(oldGxt);
    await db.exec(await migration('20261020050315_chat_kpi_history_timeout.sql'));
    await db.exec(await migration('20261020144354_chat_metric_region_normalization.sql'));
    await db.exec(await migration('20261029073000_chat_metric_ck_region.sql'));
    await db.exec(`revoke execute on function public.get_ai_chat_metric(text,text,date,date,text,text[],text[],integer,text) from public,anon;
      grant execute on function public.get_ai_chat_metric(text,text,date,date,text,text[],text[],integer,text) to authenticated;
      set role authenticated;`);

    const query = args => db.query('select public.get_ai_chat_metric($1,$2,$3,$4,$5,$6,$7,$8,$9) as v', args).then(r => r.rows[0].v);
    const byRegion = async () => {
      const result = await query(['p1st', 'SPB', '2026-10-28', '2026-10-28', 'region', [], [], 50, 'volume_desc']);
      return Object.fromEntries(result.rows.map(r => [r.entity, r.volume]));
    };

    const regions = await byRegion();
    assert.equal(regions['HCM - CK'], 100, 'hub CK trong HCM phải tách thành vùng HCM - CK');
    assert.equal(regions['HNO - CK'], 50, 'hub CK trong HNO phải tách thành vùng HNO - CK');
    assert.equal(regions['DNB'], 30, 'hub CK ngoài HCM/HNO giữ nguyên vùng gốc');
    assert.equal(regions['HCM - KA'], 20, 'KA thắng CK: hub tên chứa CK nhưng hub_type KA vẫn ở vùng HCM - KA');
    assert.equal(regions['HCM'], 10, 'hub HCM bình thường (không CK, không KA) không đổi');
    assert.equal(regions['HCM - CK'] + regions['HCM - KA'] + regions['HCM'], 130);

    const byHubType = async hubTypes => {
      const result = await query(['p1st', 'SPB', '2026-10-28', '2026-10-28', 'hub', [], hubTypes, 50, 'volume_desc']);
      return result.rows.reduce((sum, r) => sum + r.volume, 0);
    };
    assert.equal(await byHubType(['CK']), 100 + 50 + 30, 'lọc theo hub_type CK gộp cả vùng trong lẫn ngoài HCM/HNO');
    assert.equal(await byHubType(['KA']), 20, 'KA vẫn lọc đúng, không lẫn hub CK');

    await db.exec('reset role; set role anon;');
    await assert.rejects(query(['p1st', 'SPB', '2026-10-28', '2026-10-28', 'region', [], [], 50, 'volume_desc']), /permission denied/);
  } finally { await db.close(); }
});
