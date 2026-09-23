-- Append-only log of COD SMS scoring runs (one row per cron / manual batch)
-- and what each run did to each order. cod_suspicion_sms_assessments keeps
-- only the latest state per order, so without this there is no way to tell
-- which run produced a result or failed an order.
--
-- Server-only like the assessments table: items carry technical error
-- detail, so browsers read this through the Dev-only API.

create table if not exists public.cod_suspicion_sms_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron', 'manual')),
  mode text not null check (mode in ('sweep', 'cases', 'retry_failed')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'aborted', 'failed')),
  triggered_by uuid references auth.users(id) on delete set null,
  triggered_by_email text,
  model text not null,
  rubric_version text not null,
  force boolean not null default false,
  found integer not null default 0 check (found >= 0),
  claimed integer not null default 0 check (claimed >= 0),
  scored integer not null default 0 check (scored >= 0),
  no_evidence integer not null default 0 check (no_evidence >= 0),
  failed integer not null default 0 check (failed >= 0),
  skipped_unchanged integer not null default 0 check (skipped_unchanged >= 0),
  error_code text check (char_length(coalesce(error_code, '')) <= 100),
  error_message text check (char_length(coalesce(error_message, '')) <= 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_cod_suspicion_sms_runs_started
  on public.cod_suspicion_sms_runs (started_at desc);

create table if not exists public.cod_suspicion_sms_run_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.cod_suspicion_sms_runs(id) on delete cascade,
  suspicion_type text not null,
  driver_id text not null,
  order_code text not null,
  outcome text not null
    check (outcome in ('scored', 'no_evidence', 'failed', 'skipped_unchanged')),
  sms_score smallint check (sms_score is null or sms_score between 0 and 9),
  model_called boolean not null default false,
  error_code text check (char_length(coalesce(error_code, '')) <= 100),
  error_message text check (char_length(coalesce(error_message, '')) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists idx_cod_suspicion_sms_run_items_run
  on public.cod_suspicion_sms_run_items (run_id, id);

alter table public.cod_suspicion_sms_runs enable row level security;
alter table public.cod_suspicion_sms_run_items enable row level security;
revoke all on table public.cod_suspicion_sms_runs, public.cod_suspicion_sms_run_items
  from public, anon, authenticated;
revoke all on sequence public.cod_suspicion_sms_run_items_id_seq
  from public, anon, authenticated;
grant select, insert, update on table public.cod_suspicion_sms_runs to service_role;
grant select, insert on table public.cod_suspicion_sms_run_items to service_role;
