-- Migration: kas_fd_data source sheet added a "hub_type" column (same header
-- name as kas_pick_data / kas_deli_data). Add the matching column and update
-- sync_kas_fd_data to populate it, so the app's "Loại Hub" filter (Header.jsx)
-- can finally apply to the FD table too — previously fdRows had no hub grain
-- at all, so toggling "Loại Hub" had zero effect on the FD section.

alter table public.kas_fd_data add column if not exists hub_type text;

create or replace function public.sync_kas_fd_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '5min'
as $function$
begin
  truncate table public.kas_fd_data;
  insert into public.kas_fd_data (report_date, region, deliverywh, hub_type, client_name, mau_fd, fd_hoan_thanh, best_l6w_vol_fd, best_l6w_fd_hoan_thanh, sameday_lm_vol_fd, sameday_lm_fd_hoan_thanh)
  select
    nullif(r->>'report_date','')::date, r->>'region', r->>'deliverywh', r->>'hub_type', r->>'client_name',
    nullif(r->>'mau_fd','')::numeric, nullif(r->>'fd_hoan_thanh','')::numeric,
    nullif(r->>'best_l6w_vol_fd','')::numeric, nullif(r->>'best_l6w_fd_hoan_thanh','')::numeric,
    nullif(r->>'sameday_lm_vol_fd','')::numeric, nullif(r->>'sameday_lm_fd_hoan_thanh','')::numeric
  from jsonb_array_elements(payload) as r;
end;
$function$;
