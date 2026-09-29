-- First-seen log of orders pushed to the nghi_ngo_COD sheet.
--
-- One row per (suspicion_type, order_code), written the first time an order
-- appears in the export and never updated afterwards, even when its SMS,
-- call or COD fields change later. Replaces the append-only
-- nghi_ngo_COD_log tab. Server-only: written by /api/cod-suspicion-export
-- with the service role.

create table if not exists public.cod_suspicion_export_log (
  suspicion_type text not null check (suspicion_type in ('Gối đầu COD', 'Rút ruột')),
  order_code text not null check (char_length(btrim(order_code)) > 0),
  driver_id text not null,
  driver_name text,
  to_province text,
  warehouse_id text,
  warehouse_name text,
  cod_amount numeric,
  end_delivery_date date,
  driver_alert_level text not null check (driver_alert_level in ('Cao', 'Vừa')),
  first_logged_at timestamptz not null default now(),
  constraint cod_suspicion_export_log_pkey primary key (suspicion_type, order_code)
);

create index if not exists idx_cod_suspicion_export_log_first_logged_at
  on public.cod_suspicion_export_log (first_logged_at desc);
create index if not exists idx_cod_suspicion_export_log_driver
  on public.cod_suspicion_export_log (driver_id);

alter table public.cod_suspicion_export_log enable row level security;
revoke all on table public.cod_suspicion_export_log from public, anon, authenticated;
grant select, insert on table public.cod_suspicion_export_log to service_role;
