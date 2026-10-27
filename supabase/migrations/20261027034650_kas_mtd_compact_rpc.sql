-- Overview only needs month-to-date sums, not every hub-day in the daily matrix.
-- Keep raw hub/region/type/client (and wh_id for Deli/FD) so the existing frontend
-- KA/CK/GXT normalizer and filters retain exactly the same meaning.
-- SECURITY DEFINER is needed because history tables deliberately deny direct reads
-- to authenticated. Match the existing history RPC audience and require a session.
create or replace function public.get_kas_mtd_compact(dataset text, date_from date, date_to date)
returns jsonb language plpgsql stable security definer
set search_path = '' set statement_timeout = '15s' as $$
declare
  data_rows jsonb; col_list jsonb;
begin
  if auth.uid() is null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if date_from is null or date_to is null or date_from > date_to
    or date_from <> date_trunc('month', date_to)::date then
    raise exception 'MTD must start on the first day of the same month as date_to';
  end if;
  case dataset
    when 'pick' then
      col_list := '["region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      select coalesce(jsonb_agg(jsonb_build_array(region, hub, hub_type, client_name,
        mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb) into data_rows from (
        select region, hub, hub_type, client_name, sum(mau_pu) as mau_pu,
          sum(ontime_pu_1st) as ontime_pu_1st, sum(ontime_pu_opr) as ontime_pu_opr
        from public.kas_pick_history where report_date between date_from and date_to
        group by region, hub, hub_type, client_name
      ) sums;
    when 'deli' then
      col_list := '["region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr"]';
      select coalesce(jsonb_agg(jsonb_build_array(region, wh_id, hub, hub_type, client_name,
        mau_deli, ontime_deli_1st, ontime_deli_odr)), '[]'::jsonb) into data_rows from (
        select region, wh_id, hub, hub_type, client_name, sum(mau_deli) as mau_deli,
          sum(ontime_deli_1st) as ontime_deli_1st, sum(ontime_deli_odr) as ontime_deli_odr
        from public.kas_deli_history where report_date between date_from and date_to
        group by region, wh_id, hub, hub_type, client_name
      ) sums;
    when 'fd' then
      col_list := '["region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh"]';
      select coalesce(jsonb_agg(jsonb_build_array(region, wh_id, deliverywh, hub_type, client_name,
        mau_fd, fd_hoan_thanh)), '[]'::jsonb) into data_rows from (
        select region, wh_id, deliverywh, hub_type, client_name,
          sum(mau_fd) as mau_fd, sum(fd_hoan_thanh) as fd_hoan_thanh
        from public.kas_fd_history where report_date between date_from and date_to
        group by region, wh_id, deliverywh, hub_type, client_name
      ) sums;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'date_from', date_from, 'date_to', date_to,
    'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_mtd_compact(text, date, date) from public, anon, authenticated;
grant execute on function public.get_kas_mtd_compact(text, date, date) to authenticated, service_role;
