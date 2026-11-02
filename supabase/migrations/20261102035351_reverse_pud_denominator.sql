-- PUD uses its own population, never mau_pu. Existing history remains unknown
-- until the source provides mau_pud; do not backfill a denominator with zero.
alter table public.kas_reverse_history add column if not exists mau_pud numeric;
comment on column public.kas_reverse_history.mau_pud is
  'PUD sample from reverse sheet; NULL = not yet supplied, 0 = known empty sample';

create or replace function public.replace_kas_reverse_history(date_from date, date_to date, rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare
  total_n integer; distinct_n integer; deleted_n integer; inserted_n integer;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'Invalid window % .. %', date_from, date_to;
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then
    raise exception 'Batch too large: % rows (max 20000)', total_n;
  end if;
  -- Reject an old writer before it can erase samples already synced by the new script.
  if exists (select 1 from jsonb_array_elements(rows) item where not (item ? 'mau_pud'))
      and exists (select 1 from public.kas_reverse_history
        where report_date between date_from and date_to and mau_pud is not null) then
    raise exception 'Missing mau_pud: update reverse-history-sync.gs before syncing';
  end if;
  create temporary table reverse_history_incoming on commit drop as
  select r.report_date, r.region, r.hub, r.hub_type, r.client_name, r.mau_pu, r.ontime_pu_1st, r.ontime_pu_opr, r.pud, r.mau_pud
  from jsonb_populate_recordset(null::public.kas_reverse_history, rows) r;
  if exists (select 1 from pg_temp.reverse_history_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  if exists (select 1 from pg_temp.reverse_history_incoming where report_date < date_from or report_date > date_to) then
    raise exception 'Row outside window % .. %', date_from, date_to;
  end if;
  if exists (select 1 from pg_temp.reverse_history_incoming
      where mau_pud < 0 or pud < 0 or pud > mau_pud
        or mau_pud::text in ('NaN', 'Infinity', '-Infinity')
        or pud::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Invalid PUD counts: require 0 <= pud <= mau_pud';
  end if;
  select count(*) into distinct_n from (
    select 1 from pg_temp.reverse_history_incoming
    group by report_date, region, hub, hub_type, client_name) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  delete from public.kas_reverse_history where report_date between date_from and date_to;
  get diagnostics deleted_n = row_count;
  insert into public.kas_reverse_history (report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud)
  select report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud
  from pg_temp.reverse_history_incoming;
  get diagnostics inserted_n = row_count;
  drop table pg_temp.reverse_history_incoming;
  return jsonb_build_object('rows', total_n, 'deleted', deleted_n, 'inserted', inserted_n);
end $$;

revoke all on function public.replace_kas_reverse_history(date, date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_kas_reverse_history(date, date, jsonb) to service_role;

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
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","days","pud","mau_pud"]';
      select max(week_start) into latest from public.kas_reverse_history;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(jsonb_build_array(week_start::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, days, pud, mau_pud)), '[]'::jsonb)
        into data_rows from (
          select week_start, region, hub, hub_type, client_name, sum(mau_pu) as mau_pu,
            sum(ontime_pu_1st) as ontime_pu_1st, sum(ontime_pu_opr) as ontime_pu_opr,
            sum(pud) as pud,
            -- A partially populated week has no reliable PUD percentage.
            case when count(*) filter (where mau_pud is null or pud is null) = 0
              then sum(mau_pud) else null end as mau_pud,
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
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","pud","mau_pud"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud)), '[]'::jsonb)
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
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","pud","mau_pud"]';
      select coalesce(jsonb_agg(jsonb_build_array(report_date::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud)), '[]'::jsonb)
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
