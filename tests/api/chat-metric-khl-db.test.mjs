import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = async name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('KHL: hub type and vùng follow the app (KA renamed, KHL hubs by name, old filters still work)', async () => {
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
      insert into public.kas_pick_history values
        (date '2026-10-28', 'SPB', 'HCM', 'Key Account Warehouse Ho Chi Minh', 'KA', 10, 10, 10, now()),
        (date '2026-10-28', 'SPB', 'HNO', '(HNO) LH Long Biên', 'BC', 20, 20, 20, now()),
        (date '2026-10-28', 'SPB', 'HCM', 'Hub KA khác', 'KA', 30, 30, 30, now()),
        (date '2026-10-28', 'SPB', 'HCM', '(HCM) LH Củ Chi', 'BC', 40, 40, 40, now()),
        (date '2026-10-28', 'SPB', 'LAN', '(LAN) LH Đức Lập', 'BC', 50, 50, 50, now()),
        (date '2026-10-28', 'SPB', 'HCM', 'Kho CK Thủ Đức', 'BC', 60, 60, 60, now()),
        (date '2026-10-28', 'SPB', 'HCM', 'Hub thường', 'BC', 70, 70, 70, now());
      insert into public.kas_deli_history select report_date, client_name, region, hub, hub_type, mau_pu, ontime_pu_1st, ontime_pu_opr, synced_at from public.kas_pick_history;
      grant usage on schema auth to authenticated,anon,service_role;
      select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"vinhlt@ghn.vn","role":"authenticated"}',false);`);
    const oldGxt = (await migration('20261009150000_ai_chat_gxt_mien_region.sql')).split('create or replace function public.get_ai_chat_metric')[0];
    await db.exec(oldGxt);
    for (const name of ['20261020050315_chat_kpi_history_timeout.sql', '20261020144354_chat_metric_region_normalization.sql', '20261029073000_chat_metric_ck_region.sql',
      '20261029090000_chat_metric_pagination.sql', '20261119120000_chat_metric_khl.sql']) await db.exec(await migration(name));
    await db.exec('set role authenticated;');
    const query = (grain, regions = [], hubTypes = []) => db.query('select public.get_ai_chat_metric($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as v',
      ['p1st', 'SPB', '2026-10-28', '2026-10-28', grain, regions, hubTypes, 50, 'volume_desc', 0]).then(r => r.rows[0].v);
    const volumes = async (grain, regions, hubTypes) => Object.fromEntries((await query(grain, regions, hubTypes)).rows.map(r => [r.entity, r.volume]));

    const regions = await volumes('region');
    assert.equal(regions['HCM - KHL'], 10 + 30 + 40 + 50, 'kho Key Account HCM, hub nhãn KA và các kho KHL mới (kể cả Đức Lập) về vùng HCM - KHL');
    assert.equal(regions['HNO - KHL'], 20, 'LH Long Biên về vùng HNO - KHL');
    assert.equal(regions['HCM'], 70, 'hub thường không đổi');
    assert.equal(regions['LAN'], undefined, 'Đức Lập đã sang vùng HCM - KHL');
    assert.equal(regions['HCM - CK'], 60);
    assert.ok(!Object.keys(regions).some(r => r.endsWith(' - KA')), 'không còn vùng - KA');

    const khl = ['Key Account Warehouse Ho Chi Minh', '(HNO) LH Long Biên', 'Hub KA khác', '(HCM) LH Củ Chi', '(LAN) LH Đức Lập'];
    assert.deepEqual(Object.keys(await volumes('hub', [], ['KHL'])).sort(), [...khl].sort(), 'lọc KHL gồm cả kho nhận theo tên');
    assert.deepEqual(await volumes('hub', [], ['KA']), await volumes('hub', [], ['KHL']), 'bộ lọc cũ KA vẫn được hiểu là KHL');
    assert.deepEqual(await volumes('region', ['HCM - KA'], []), await volumes('region', ['HCM - KHL'], []), 'bộ lọc vùng cũ HCM - KA vẫn được hiểu');
    assert.deepEqual(Object.keys(await volumes('hub', [], ['BC'])), ['Hub thường'], 'kho KHL không còn lẫn trong BC');
    assert.deepEqual(Object.keys(await volumes('hub', [], ['CK'])), ['Kho CK Thủ Đức']);
  } finally { await db.close(); }
});
