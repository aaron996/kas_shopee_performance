-- Migration: the Pick / Deli / FD source tabs gained a "wh_id" column. Store it
-- on the matching tables and have the sync RPCs populate it. Not used by the
-- frontend yet. Left as text so any leading zeros in the source are preserved.

alter table public.kas_pick_data add column if not exists wh_id text;
alter table public.kas_deli_data add column if not exists wh_id text;
alter table public.kas_fd_data add column if not exists wh_id text;

create or replace function public.sync_kas_pick_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '5min'
as $function$
begin
  truncate table public.kas_pick_data;
  insert into public.kas_pick_data (report_date, region, hub, wh_id, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, best_l6w_vol_1st, best_l6w_ontime_1st, best_l6w_vol_opr, best_l6w_ontime_opr, sameday_lm_vol, sameday_lm_ontime_1st, sameday_lm_ontime_opr)
  select
    nullif(r->>'report_date','')::date, r->>'region', r->>'hub', nullif(trim(r->>'wh_id'),''), r->>'hub_type', r->>'client_name',
    nullif(r->>'mau_pu','')::numeric, nullif(r->>'ontime_pu_1st','')::numeric, nullif(r->>'ontime_pu_opr','')::numeric,
    nullif(r->>'best_l6w_vol_1st','')::numeric, nullif(r->>'best_l6w_ontime_1st','')::numeric,
    nullif(r->>'best_l6w_vol_opr','')::numeric, nullif(r->>'best_l6w_ontime_opr','')::numeric,
    nullif(r->>'sameday_lm_vol','')::numeric, nullif(r->>'sameday_lm_ontime_1st','')::numeric, nullif(r->>'sameday_lm_ontime_opr','')::numeric
  from jsonb_array_elements(payload) as r;
end;
$function$;

create or replace function public.sync_kas_deli_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '5min'
as $function$
begin
  truncate table public.kas_deli_data;
  insert into public.kas_deli_data (report_date, region, hub, wh_id, hub_type, client_name, mau_deli, ontime_deli_1st, ontime_deli_odr, best_l6w_vol_1st, best_l6w_ontime_1st, best_l6w_vol_odr, best_l6w_ontime_odr, sameday_lm_vol, sameday_lm_ontime_1st, sameday_lm_ontime_odr)
  select
    nullif(r->>'report_date','')::date, r->>'region', r->>'hub', nullif(trim(r->>'wh_id'),''), r->>'hub_type', r->>'client_name',
    nullif(r->>'mau_deli','')::numeric, nullif(r->>'ontime_deli_1st','')::numeric, nullif(r->>'ontime_deli_odr','')::numeric,
    nullif(r->>'best_l6w_vol_1st','')::numeric, nullif(r->>'best_l6w_ontime_1st','')::numeric,
    nullif(r->>'best_l6w_vol_odr','')::numeric, nullif(r->>'best_l6w_ontime_odr','')::numeric,
    nullif(r->>'sameday_lm_vol','')::numeric, nullif(r->>'sameday_lm_ontime_1st','')::numeric, nullif(r->>'sameday_lm_ontime_odr','')::numeric
  from jsonb_array_elements(payload) as r;
end;
$function$;

create or replace function public.sync_kas_fd_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '5min'
as $function$
begin
  truncate table public.kas_fd_data;
  insert into public.kas_fd_data (report_date, region, deliverywh, wh_id, hub_type, client_name, mau_fd, fd_hoan_thanh, best_l6w_vol_fd, best_l6w_fd_hoan_thanh, sameday_lm_vol_fd, sameday_lm_fd_hoan_thanh)
  select
    nullif(r->>'report_date','')::date, r->>'region', r->>'deliverywh', nullif(trim(r->>'wh_id'),''), r->>'hub_type', r->>'client_name',
    nullif(r->>'mau_fd','')::numeric, nullif(r->>'fd_hoan_thanh','')::numeric,
    nullif(r->>'best_l6w_vol_fd','')::numeric, nullif(r->>'best_l6w_fd_hoan_thanh','')::numeric,
    nullif(r->>'sameday_lm_vol_fd','')::numeric, nullif(r->>'sameday_lm_fd_hoan_thanh','')::numeric
  from jsonb_array_elements(payload) as r;
end;
$function$;
