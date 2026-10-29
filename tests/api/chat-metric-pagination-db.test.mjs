import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = async name => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('p_offset pages through more than 50 entities; totalEntities tells the caller when to stop', async () => {
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
      -- 55 distinct hubs, all plain DNB/BC so none of the KA/CK/GXT reassignment
      -- branches apply; volume = hub index so sort order is deterministic.
      insert into public.kas_pick_history
      select date '2026-10-28', 'SPB', 'DNB', 'Hub ' || lpad(n::text, 2, '0'), 'BC', n, n, n, timestamptz '2026-10-29 00:00:00Z'
      from generate_series(1, 55) n;
      insert into public.kas_deli_history select * from public.kas_pick_history;
      grant usage on schema auth to authenticated,anon,service_role;
      select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"vinhlt@ghn.vn","role":"authenticated"}',false);`);
    const oldGxt = (await migration('20261009150000_ai_chat_gxt_mien_region.sql')).split('create or replace function public.get_ai_chat_metric')[0];
    await db.exec(oldGxt);
    await db.exec(await migration('20261020050315_chat_kpi_history_timeout.sql'));
    await db.exec(await migration('20261020144354_chat_metric_region_normalization.sql'));
    await db.exec(await migration('20261029073000_chat_metric_ck_region.sql'));
    await db.exec(await migration('20261029090000_chat_metric_pagination.sql'));
    await db.exec(`set role authenticated;`);

    const query = args => db.query('select public.get_ai_chat_metric($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as v', args).then(r => r.rows[0].v);
    const page = offset => query(['p1st', 'SPB', '2026-10-28', '2026-10-28', 'hub', [], [], 20, 'volume_desc', offset]);

    const first = await page(0);
    assert.equal(first.totalEntities, 55);
    assert.equal(first.offset, 0);
    assert.equal(first.rows.length, 20);
    assert.equal(first.rows[0].entity, 'Hub 55');

    const second = await page(20);
    assert.equal(second.rows.length, 20);
    assert.equal(second.offset, 20);

    const third = await page(40);
    assert.equal(third.rows.length, 15, 'last page only has the remaining 15 of 55');

    const beyond = await page(55);
    assert.equal(beyond.rows.length, 0);
    assert.equal(beyond.totalEntities, 55, 'totalEntities stays correct even past the end');

    const seen = new Set([...first.rows, ...second.rows, ...third.rows].map(r => r.entity));
    assert.equal(seen.size, 55, 'three pages together cover every hub exactly once');
    const totalVolume = [...first.rows, ...second.rows, ...third.rows].reduce((sum, r) => sum + r.volume, 0);
    assert.equal(totalVolume, (55 * 56) / 2);

    // Default p_offset (omitted 10th arg) behaves like offset 0 for any
    // existing caller that hasn't been updated to pass it.
    const defaulted = await db.query('select public.get_ai_chat_metric($1,$2,$3,$4,$5,$6,$7,$8,$9) as v',
      ['p1st', 'SPB', '2026-10-28', '2026-10-28', 'hub', [], [], 20, 'volume_desc']).then(r => r.rows[0].v);
    assert.deepEqual(defaulted, first);

    await assert.rejects(page(-1), /AI_CHAT_METRIC_ARGUMENT_NOT_ALLOWED/);
  } finally { await db.close(); }
});
