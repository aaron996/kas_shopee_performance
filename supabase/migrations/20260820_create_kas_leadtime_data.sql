-- Migration: create kas_leadtime_data table and atomic full-refresh RPC function sync_kas_leadtime_data

create table if not exists public.kas_leadtime_data (
  id bigint generated always as identity primary key,
  report_date date not null,
  fromprovince_new text,
  toprovince_new text,
  externallane_new text,
  client_name text not null,
  mau integer,
  avg_lt_prepickup_hour numeric,
  avg_lt_firstmile_hour numeric,
  avg_lt_middlemile_hour numeric,
  avg_lt_lastmile_hour numeric,
  avg_lt_e2e_hour numeric,
  synced_at timestamptz not null default now()
);

alter table public.kas_leadtime_data enable row level security;

-- Authenticated users can read leadtime data
create policy "authenticated can select kas_leadtime_data"
  on public.kas_leadtime_data for select
  to authenticated
  using (true);

grant select on public.kas_leadtime_data to authenticated;

-- RPC function for Apps Script to sync leadtime data atomically (delete + insert in 1 transaction)
create or replace function public.sync_kas_leadtime_data(payload jsonb)
returns void
language plpgsql
security definer
as $$
begin
  delete from public.kas_leadtime_data;
  insert into public.kas_leadtime_data (
    report_date, fromprovince_new, toprovince_new, externallane_new,
    client_name, mau, avg_lt_prepickup_hour, avg_lt_firstmile_hour,
    avg_lt_middlemile_hour, avg_lt_lastmile_hour, avg_lt_e2e_hour, synced_at
  )
  select
    (r->>'report_date')::date,
    nullif(trim(r->>'fromprovince_new'), ''),
    nullif(trim(r->>'toprovince_new'), ''),
    nullif(trim(r->>'externallane_new'), ''),
    r->>'client_name',
    nullif(r->>'mau', '')::integer,
    nullif(r->>'avg_lt_prepickup_hour', '')::numeric,
    nullif(r->>'avg_lt_firstmile_hour', '')::numeric,
    nullif(r->>'avg_lt_middlemile_hour', '')::numeric,
    nullif(r->>'avg_lt_lastmile_hour', '')::numeric,
    nullif(r->>'avg_lt_e2e_hour', '')::numeric,
    now()
  from jsonb_array_elements(payload) as r;
end;
$$;

-- Revoke execute from public/anon/authenticated; only service_role can call sync
revoke execute on function public.sync_kas_leadtime_data(jsonb) from public, anon, authenticated;
grant execute on function public.sync_kas_leadtime_data(jsonb) to service_role;
