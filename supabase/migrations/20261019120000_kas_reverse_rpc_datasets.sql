-- Thêm dataset 'reverse' (bảng kas_reverse_history, client_name 'SPE Reverse', chỉ có Pick) vào ba RPC đọc
-- lịch sử để bảng Theo ngày / Theo tuần / Xuất CSV dùng chung luồng với SPB và SPE.
-- Bảng kas_reverse_history chỉ service_role đọc được; frontend đi qua RPC security definer này.

create or replace function public.get_kas_weekly_compact(dataset text, weeks integer default 9)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  latest date; first_week date; week_list jsonb; data_rows jsonb; col_list jsonb;
begin
  if weeks is null or weeks < 1 or weeks > 16 then
    raise exception 'weeks must be between 1 and 16';
  end if;
  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","days"]';
      select max(week_start) into latest from public.kas_pick_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, days)), '[]'::jsonb)
        into data_rows from public.kas_pick_weekly where week_start >= first_week;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_pick_weekly where week_start >= first_week) s;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr","days"]';
      select max(week_start) into latest from public.kas_deli_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr, days)), '[]'::jsonb)
        into data_rows from public.kas_deli_weekly where week_start >= first_week;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_deli_weekly where week_start >= first_week) s;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh","days"]';
      select max(week_start) into latest from public.kas_fd_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh, days)), '[]'::jsonb)
        into data_rows from public.kas_fd_weekly where week_start >= first_week;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_fd_weekly where week_start >= first_week) s;
    when 'reverse' then
      -- Reverse chỉ có Pick; không có bảng tuần nên cộng trực tiếp từ bảng ngày (~1.000 dòng/ngày).
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","days"]';
      select max(week_start) into latest from public.kas_reverse_history;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, days)), '[]'::jsonb)
        into data_rows from (
          select week_start, region, hub, hub_type, client_name, sum(mau_pu) as mau_pu,
            sum(ontime_pu_1st) as ontime_pu_1st, sum(ontime_pu_opr) as ontime_pu_opr,
            count(distinct report_date) as days
          from public.kas_reverse_history where week_start >= first_week
          group by week_start, region, hub, hub_type, client_name) t;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_reverse_history where week_start >= first_week) s;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'weeks', week_list, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_weekly_compact(text, integer) from public, anon, authenticated;
grant execute on function public.get_kas_weekly_compact(text, integer) to authenticated, service_role;

create or replace function public.get_kas_daily_compact(dataset text, from_date date, to_date date)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  data_rows jsonb; col_list jsonb;
begin
  if from_date is null or to_date is null or from_date > to_date then
    raise exception 'from_date must be on or before to_date';
  end if;
  if to_date - from_date > 13 then
    raise exception 'range must be at most 14 days';
  end if;
  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb)
        into data_rows from public.kas_pick_history where report_date between from_date and to_date;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr)), '[]'::jsonb)
        into data_rows from public.kas_deli_history where report_date between from_date and to_date;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh)), '[]'::jsonb)
        into data_rows from public.kas_fd_history where report_date between from_date and to_date;
    when 'reverse' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb)
        into data_rows from public.kas_reverse_history where report_date between from_date and to_date;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_daily_compact(text, date, date) from public, anon, authenticated;
grant execute on function public.get_kas_daily_compact(text, date, date) to authenticated, service_role;

create or replace function public.get_kas_daily_range_compact(dataset text, date_from date, date_to date)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  date_list jsonb; data_rows jsonb; col_list jsonb;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'invalid date range';
  end if;
  if date_to - date_from > 91 then
    raise exception 'date range must not exceed 92 days';
  end if;
  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb)
        into data_rows from public.kas_pick_history where report_date between date_from and date_to;
      select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into date_list from (
        select distinct report_date::text as d from public.kas_pick_history where report_date between date_from and date_to) s;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr)), '[]'::jsonb)
        into data_rows from public.kas_deli_history where report_date between date_from and date_to;
      select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into date_list from (
        select distinct report_date::text as d from public.kas_deli_history where report_date between date_from and date_to) s;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh)), '[]'::jsonb)
        into data_rows from public.kas_fd_history where report_date between date_from and date_to;
      select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into date_list from (
        select distinct report_date::text as d from public.kas_fd_history where report_date between date_from and date_to) s;
    when 'reverse' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr)), '[]'::jsonb)
        into data_rows from public.kas_reverse_history where report_date between date_from and date_to;
      select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into date_list from (
        select distinct report_date::text as d from public.kas_reverse_history where report_date between date_from and date_to) s;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'weeks', date_list, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.get_kas_daily_range_compact(text, date, date) from public, anon, authenticated;
grant execute on function public.get_kas_daily_range_compact(text, date, date) to authenticated, service_role;
