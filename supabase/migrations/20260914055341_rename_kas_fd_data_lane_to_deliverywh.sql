-- Migration: kas_fd_data source sheet dropped the "lane" column and replaced
-- it with "deliverywh" (delivery warehouse code). Rename the matching column
-- so the sync function populates it again, and update sync_kas_fd_data to
-- read the new payload key.
--
-- Note: the original kas_fd_data table + sync_kas_fd_data function were
-- created directly on Supabase (migrations create_kas_fd_data_table /
-- fix_kas_fd_data_rls_policy / create_sync_kas_fd_data_function, 2026-09-10)
-- without a matching file in this repo. This migration is the first one for
-- this table tracked in git.

alter table public.kas_fd_data rename column externallane to deliverywh;

create or replace function public.sync_kas_fd_data(payload jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '5min'
as $function$
begin
  truncate table public.kas_fd_data;
  insert into public.kas_fd_data (report_date, region, deliverywh, client_name, mau_fd, fd_hoan_thanh, best_l6w_vol_fd, best_l6w_fd_hoan_thanh, sameday_lm_vol_fd, sameday_lm_fd_hoan_thanh)
  select
    nullif(r->>'report_date','')::date, r->>'region', r->>'deliverywh', r->>'client_name',
    nullif(r->>'mau_fd','')::numeric, nullif(r->>'fd_hoan_thanh','')::numeric,
    nullif(r->>'best_l6w_vol_fd','')::numeric, nullif(r->>'best_l6w_fd_hoan_thanh','')::numeric,
    nullif(r->>'sameday_lm_vol_fd','')::numeric, nullif(r->>'sameday_lm_fd_hoan_thanh','')::numeric
  from jsonb_array_elements(payload) as r;
end;
$function$;
