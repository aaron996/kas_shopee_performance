-- KAS-317: bảng chi tiết hub-ngày-client-province(-lane) cho bộ lọc Province / Lane.
-- Chỉ chứa số CỘNG ĐƯỢC (mau_*, ontime_*, fd_hoan_thanh, pud, mau_pud). KHÔNG có benchmark
-- (best_l6w_*, sameday_lm_*): chúng ở grain hub nên không tách được theo tỉnh/lane.
-- Các bảng hub-level hiện có (kas_*_data, *_history, *_weekly, *_monthly) giữ nguyên.
-- Tuần/tháng: không tạo bảng weekly/monthly riêng. get_kas_detail_compact cộng trực tiếp từ bảng ngày
-- theo (grain, province, lane) đã lọc; chỉ chạy khi người dùng bật bộ lọc nên số dòng đọc đã được thu hẹp
-- bởi index (province, report_date). Nếu sau này chậm thì thêm bảng cộng sẵn như kas_*_weekly.
-- Thiết kế: docs/kas-province-lane-filters.md.

create table if not exists public.kas_pick_detail (
  id bigint generated always as identity primary key,
  report_date date not null,
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text, hub text, hub_type text, client_name text, province text,
  mau_pu numeric, ontime_pu_1st numeric, ontime_pu_opr numeric,
  synced_at timestamptz not null default now(),
  constraint kas_pick_detail_key unique nulls not distinct (report_date, region, hub, hub_type, client_name, province)
);

create table if not exists public.kas_deli_detail (
  id bigint generated always as identity primary key,
  report_date date not null,
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text, wh_id text, hub text, hub_type text, client_name text, province text, lane text,
  mau_deli numeric, ontime_deli_1st numeric, ontime_deli_odr numeric,
  synced_at timestamptz not null default now(),
  constraint kas_deli_detail_key unique nulls not distinct (report_date, region, wh_id, hub, hub_type, client_name, province, lane)
);

create table if not exists public.kas_fd_detail (
  id bigint generated always as identity primary key,
  report_date date not null,
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text, wh_id text, deliverywh text, hub_type text, client_name text, province text, lane text,
  mau_fd numeric, fd_hoan_thanh numeric,
  synced_at timestamptz not null default now(),
  constraint kas_fd_detail_key unique nulls not distinct (report_date, region, wh_id, deliverywh, hub_type, client_name, province, lane)
);

create table if not exists public.kas_reverse_detail (
  id bigint generated always as identity primary key,
  report_date date not null,
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text, hub text, hub_type text, client_name text, province text,
  mau_pu numeric, ontime_pu_1st numeric, ontime_pu_opr numeric, pud numeric, mau_pud numeric,
  synced_at timestamptz not null default now(),
  constraint kas_reverse_detail_key unique nulls not distinct (report_date, region, hub, hub_type, client_name, province)
);

-- Index theo (report_date, hub, client_name, province, lane) cho đọc theo khoảng ngày + hub,
-- và (province, report_date) cho bộ lọc.
create index if not exists kas_pick_detail_scan_idx on public.kas_pick_detail (report_date, hub, client_name, province);
create index if not exists kas_pick_detail_province_idx on public.kas_pick_detail (province, report_date);
create index if not exists kas_deli_detail_scan_idx on public.kas_deli_detail (report_date, hub, client_name, province, lane);
create index if not exists kas_deli_detail_province_idx on public.kas_deli_detail (province, report_date);
create index if not exists kas_deli_detail_lane_idx on public.kas_deli_detail (lane, report_date);
create index if not exists kas_fd_detail_scan_idx on public.kas_fd_detail (report_date, deliverywh, client_name, province, lane);
create index if not exists kas_fd_detail_province_idx on public.kas_fd_detail (province, report_date);
create index if not exists kas_fd_detail_lane_idx on public.kas_fd_detail (lane, report_date);
create index if not exists kas_reverse_detail_scan_idx on public.kas_reverse_detail (report_date, hub, client_name, province);
create index if not exists kas_reverse_detail_province_idx on public.kas_reverse_detail (province, report_date);

alter table public.kas_pick_detail enable row level security;
alter table public.kas_deli_detail enable row level security;
alter table public.kas_fd_detail enable row level security;
alter table public.kas_reverse_detail enable row level security;
revoke all on public.kas_pick_detail, public.kas_deli_detail, public.kas_fd_detail, public.kas_reverse_detail
  from public, anon, authenticated;
grant select, insert, update, delete on public.kas_pick_detail, public.kas_deli_detail, public.kas_fd_detail,
  public.kas_reverse_detail to service_role;

-- Upsert theo lô (không xoá), cùng khuôn upsert_kas_*_history. Mọi dòng phải nằm trong [date_from, date_to],
-- khoá trùng trong lô là lỗi nguồn, số âm bị từ chối. Chạy lại cùng dữ liệu là no-op.
create or replace function public.upsert_kas_pick_detail(date_from date, date_to date, rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare total_n integer; distinct_n integer; written_n integer;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'Invalid window % .. %', date_from, date_to;
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then raise exception 'Batch too large: % rows (max 20000)', total_n; end if;
  create temporary table pick_detail_incoming on commit drop as
  select r.report_date, r.region, r.hub, r.hub_type, r.client_name, r.province,
    r.mau_pu, r.ontime_pu_1st, r.ontime_pu_opr
  from jsonb_populate_recordset(null::public.kas_pick_detail, rows) r;
  if exists (select 1 from pg_temp.pick_detail_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  if exists (select 1 from pg_temp.pick_detail_incoming where report_date < date_from or report_date > date_to) then
    raise exception 'Row outside window % .. %', date_from, date_to;
  end if;
  if exists (select 1 from pg_temp.pick_detail_incoming where mau_pu < 0 or ontime_pu_1st < 0 or ontime_pu_opr < 0) then
    raise exception 'Negative counts are not allowed';
  end if;
  select count(*) into distinct_n from (select 1 from pg_temp.pick_detail_incoming
    group by report_date, region, hub, hub_type, client_name, province) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  insert into public.kas_pick_detail as t (report_date, region, hub, hub_type, client_name, province,
    mau_pu, ontime_pu_1st, ontime_pu_opr)
  select report_date, region, hub, hub_type, client_name, province, mau_pu, ontime_pu_1st, ontime_pu_opr
  from pg_temp.pick_detail_incoming
  on conflict on constraint kas_pick_detail_key do update
    set mau_pu = excluded.mau_pu, ontime_pu_1st = excluded.ontime_pu_1st,
        ontime_pu_opr = excluded.ontime_pu_opr, synced_at = now()
    where (t.mau_pu, t.ontime_pu_1st, t.ontime_pu_opr)
      is distinct from (excluded.mau_pu, excluded.ontime_pu_1st, excluded.ontime_pu_opr);
  get diagnostics written_n = row_count;
  drop table pg_temp.pick_detail_incoming;
  return jsonb_build_object('rows', total_n, 'written', written_n, 'unchanged', total_n - written_n);
end $$;

create or replace function public.upsert_kas_deli_detail(date_from date, date_to date, rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare total_n integer; distinct_n integer; written_n integer;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'Invalid window % .. %', date_from, date_to;
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then raise exception 'Batch too large: % rows (max 20000)', total_n; end if;
  create temporary table deli_detail_incoming on commit drop as
  select r.report_date, r.region, r.wh_id, r.hub, r.hub_type, r.client_name, r.province, r.lane,
    r.mau_deli, r.ontime_deli_1st, r.ontime_deli_odr
  from jsonb_populate_recordset(null::public.kas_deli_detail, rows) r;
  if exists (select 1 from pg_temp.deli_detail_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  if exists (select 1 from pg_temp.deli_detail_incoming where report_date < date_from or report_date > date_to) then
    raise exception 'Row outside window % .. %', date_from, date_to;
  end if;
  if exists (select 1 from pg_temp.deli_detail_incoming where mau_deli < 0 or ontime_deli_1st < 0 or ontime_deli_odr < 0) then
    raise exception 'Negative counts are not allowed';
  end if;
  select count(*) into distinct_n from (select 1 from pg_temp.deli_detail_incoming
    group by report_date, region, wh_id, hub, hub_type, client_name, province, lane) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  insert into public.kas_deli_detail as t (report_date, region, wh_id, hub, hub_type, client_name, province, lane,
    mau_deli, ontime_deli_1st, ontime_deli_odr)
  select report_date, region, wh_id, hub, hub_type, client_name, province, lane,
    mau_deli, ontime_deli_1st, ontime_deli_odr
  from pg_temp.deli_detail_incoming
  on conflict on constraint kas_deli_detail_key do update
    set mau_deli = excluded.mau_deli, ontime_deli_1st = excluded.ontime_deli_1st,
        ontime_deli_odr = excluded.ontime_deli_odr, synced_at = now()
    where (t.mau_deli, t.ontime_deli_1st, t.ontime_deli_odr)
      is distinct from (excluded.mau_deli, excluded.ontime_deli_1st, excluded.ontime_deli_odr);
  get diagnostics written_n = row_count;
  drop table pg_temp.deli_detail_incoming;
  return jsonb_build_object('rows', total_n, 'written', written_n, 'unchanged', total_n - written_n);
end $$;

create or replace function public.upsert_kas_fd_detail(date_from date, date_to date, rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare total_n integer; distinct_n integer; written_n integer;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'Invalid window % .. %', date_from, date_to;
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then raise exception 'Batch too large: % rows (max 20000)', total_n; end if;
  create temporary table fd_detail_incoming on commit drop as
  select r.report_date, r.region, r.wh_id, r.deliverywh, r.hub_type, r.client_name, r.province, r.lane,
    r.mau_fd, r.fd_hoan_thanh
  from jsonb_populate_recordset(null::public.kas_fd_detail, rows) r;
  if exists (select 1 from pg_temp.fd_detail_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  if exists (select 1 from pg_temp.fd_detail_incoming where report_date < date_from or report_date > date_to) then
    raise exception 'Row outside window % .. %', date_from, date_to;
  end if;
  if exists (select 1 from pg_temp.fd_detail_incoming where mau_fd < 0 or fd_hoan_thanh < 0) then
    raise exception 'Negative counts are not allowed';
  end if;
  select count(*) into distinct_n from (select 1 from pg_temp.fd_detail_incoming
    group by report_date, region, wh_id, deliverywh, hub_type, client_name, province, lane) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  insert into public.kas_fd_detail as t (report_date, region, wh_id, deliverywh, hub_type, client_name, province, lane,
    mau_fd, fd_hoan_thanh)
  select report_date, region, wh_id, deliverywh, hub_type, client_name, province, lane, mau_fd, fd_hoan_thanh
  from pg_temp.fd_detail_incoming
  on conflict on constraint kas_fd_detail_key do update
    set mau_fd = excluded.mau_fd, fd_hoan_thanh = excluded.fd_hoan_thanh, synced_at = now()
    where (t.mau_fd, t.fd_hoan_thanh) is distinct from (excluded.mau_fd, excluded.fd_hoan_thanh);
  get diagnostics written_n = row_count;
  drop table pg_temp.fd_detail_incoming;
  return jsonb_build_object('rows', total_n, 'written', written_n, 'unchanged', total_n - written_n);
end $$;

create or replace function public.upsert_kas_reverse_detail(date_from date, date_to date, rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare total_n integer; distinct_n integer; written_n integer;
begin
  if date_from is null or date_to is null or date_from > date_to then
    raise exception 'Invalid window % .. %', date_from, date_to;
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then raise exception 'Batch too large: % rows (max 20000)', total_n; end if;
  create temporary table reverse_detail_incoming on commit drop as
  select r.report_date, r.region, r.hub, r.hub_type, r.client_name, r.province,
    r.mau_pu, r.ontime_pu_1st, r.ontime_pu_opr, r.pud, r.mau_pud
  from jsonb_populate_recordset(null::public.kas_reverse_detail, rows) r;
  if exists (select 1 from pg_temp.reverse_detail_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  if exists (select 1 from pg_temp.reverse_detail_incoming where report_date < date_from or report_date > date_to) then
    raise exception 'Row outside window % .. %', date_from, date_to;
  end if;
  -- Cùng ràng buộc PUD với upsert_kas_reverse_history.
  if exists (select 1 from pg_temp.reverse_detail_incoming
      where mau_pu < 0 or ontime_pu_1st < 0 or ontime_pu_opr < 0 or mau_pud < 0 or pud < 0 or pud > mau_pud
        or mau_pud::text in ('NaN', 'Infinity', '-Infinity') or pud::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Invalid counts: require 0 <= pud <= mau_pud and no negatives';
  end if;
  select count(*) into distinct_n from (select 1 from pg_temp.reverse_detail_incoming
    group by report_date, region, hub, hub_type, client_name, province) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  insert into public.kas_reverse_detail as t (report_date, region, hub, hub_type, client_name, province,
    mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud)
  select report_date, region, hub, hub_type, client_name, province, mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud
  from pg_temp.reverse_detail_incoming
  on conflict on constraint kas_reverse_detail_key do update
    set mau_pu = excluded.mau_pu, ontime_pu_1st = excluded.ontime_pu_1st, ontime_pu_opr = excluded.ontime_pu_opr,
        pud = excluded.pud, mau_pud = excluded.mau_pud, synced_at = now()
    where (t.mau_pu, t.ontime_pu_1st, t.ontime_pu_opr, t.pud, t.mau_pud)
      is distinct from (excluded.mau_pu, excluded.ontime_pu_1st, excluded.ontime_pu_opr, excluded.pud, excluded.mau_pud);
  get diagnostics written_n = row_count;
  drop table pg_temp.reverse_detail_incoming;
  return jsonb_build_object('rows', total_n, 'written', written_n, 'unchanged', total_n - written_n);
end $$;

-- Đọc cho dashboard khi bật bộ lọc Province / Lane. Trả cùng hình dạng get_kas_*_compact: mỗi dòng là mảng
-- theo `cols`, report_date = đầu kỳ (ngày, thứ Hai, hoặc mùng 1), cộng sẵn về grain hub (bỏ province, lane)
-- sau khi lọc. Không có cột benchmark. provinces / lanes rỗng hoặc null = không lọc; lanes bị bỏ qua với
-- pick và reverse (không có lane).
-- date_to null = ngày mới nhất của bảng. date_from null = 14 ngày (day), 9 tuần (week), 6 tháng (month).
create or replace function public.get_kas_detail_compact(
  dataset text, grain text, date_from date default null, date_to date default null,
  provinces text[] default null, lanes text[] default null)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  latest date; d_from date; d_to date; period_list jsonb; data_rows jsonb; col_list jsonb;
  use_p boolean := coalesce(cardinality(provinces), 0) > 0;
  use_l boolean := coalesce(cardinality(lanes), 0) > 0;
begin
  if auth.uid() is null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if grain not in ('day', 'week', 'month') then raise exception 'Unsupported grain: %', grain; end if;
  case dataset
    when 'pick' then select max(report_date) into latest from public.kas_pick_detail;
    when 'deli' then select max(report_date) into latest from public.kas_deli_detail;
    when 'fd' then select max(report_date) into latest from public.kas_fd_detail;
    when 'reverse' then select max(report_date) into latest from public.kas_reverse_detail;
    else raise exception 'Unsupported dataset: %', dataset;
  end case;
  if latest is null then
    return jsonb_build_object('dataset', dataset, 'grain', grain, 'weeks', '[]'::jsonb, 'cols', '[]'::jsonb, 'rows', '[]'::jsonb);
  end if;
  d_to := coalesce(date_to, latest);
  d_from := coalesce(date_from, case grain
    when 'day' then d_to - 13
    when 'week' then (d_to - (extract(isodow from d_to)::int - 1)) - 56
    else (date_trunc('month', d_to) - interval '5 months')::date end);
  if d_from > d_to then raise exception 'invalid date range'; end if;
  if (grain = 'day' and d_to - d_from > 91) or d_to - d_from > 400 then
    raise exception 'date range too long for grain %', grain;
  end if;
  -- Tuần/tháng: lấy trọn kỳ chứa d_from để cột tuần/tháng đầu không bị thiếu ngày.
  if grain = 'week' then d_from := d_from - (extract(isodow from d_from)::int - 1);
  elsif grain = 'month' then d_from := date_trunc('month', d_from)::date; end if;

  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","days"]';
      with s as (
        select case grain when 'day' then report_date when 'week' then week_start else date_trunc('month', report_date)::date end as period,
          report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr
        from public.kas_pick_detail
        where report_date between d_from and d_to and (not use_p or province = any(provinces))),
      g as (
        select period, region, hub, hub_type, client_name, sum(mau_pu) mau_pu, sum(ontime_pu_1st) ontime_pu_1st,
          sum(ontime_pu_opr) ontime_pu_opr, count(distinct report_date) days
        from s group by period, region, hub, hub_type, client_name)
      select coalesce(jsonb_agg(jsonb_build_array(period::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, days)), '[]'::jsonb),
        coalesce(jsonb_agg(distinct period::text), '[]'::jsonb)
      into data_rows, period_list from g;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr","days"]';
      with s as (
        select case grain when 'day' then report_date when 'week' then week_start else date_trunc('month', report_date)::date end as period,
          report_date, region, wh_id, hub, hub_type, client_name, mau_deli, ontime_deli_1st, ontime_deli_odr
        from public.kas_deli_detail
        where report_date between d_from and d_to and (not use_p or province = any(provinces))
          and (not use_l or lane = any(lanes))),
      g as (
        select period, region, wh_id, hub, hub_type, client_name, sum(mau_deli) mau_deli,
          sum(ontime_deli_1st) ontime_deli_1st, sum(ontime_deli_odr) ontime_deli_odr, count(distinct report_date) days
        from s group by period, region, wh_id, hub, hub_type, client_name)
      select coalesce(jsonb_agg(jsonb_build_array(period::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr, days)), '[]'::jsonb),
        coalesce(jsonb_agg(distinct period::text), '[]'::jsonb)
      into data_rows, period_list from g;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh","days"]';
      with s as (
        select case grain when 'day' then report_date when 'week' then week_start else date_trunc('month', report_date)::date end as period,
          report_date, region, wh_id, deliverywh, hub_type, client_name, mau_fd, fd_hoan_thanh
        from public.kas_fd_detail
        where report_date between d_from and d_to and (not use_p or province = any(provinces))
          and (not use_l or lane = any(lanes))),
      g as (
        select period, region, wh_id, deliverywh, hub_type, client_name, sum(mau_fd) mau_fd,
          sum(fd_hoan_thanh) fd_hoan_thanh, count(distinct report_date) days
        from s group by period, region, wh_id, deliverywh, hub_type, client_name)
      select coalesce(jsonb_agg(jsonb_build_array(period::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh, days)), '[]'::jsonb),
        coalesce(jsonb_agg(distinct period::text), '[]'::jsonb)
      into data_rows, period_list from g;
    else
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","pud","mau_pud","days"]';
      with s as (
        select case grain when 'day' then report_date when 'week' then week_start else date_trunc('month', report_date)::date end as period,
          report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud
        from public.kas_reverse_detail
        where report_date between d_from and d_to and (not use_p or province = any(provinces))),
      g as (
        select period, region, hub, hub_type, client_name, sum(mau_pu) mau_pu, sum(ontime_pu_1st) ontime_pu_1st,
          sum(ontime_pu_opr) ontime_pu_opr, sum(pud) pud, sum(mau_pud) mau_pud, count(distinct report_date) days
        from s group by period, region, hub, hub_type, client_name)
      select coalesce(jsonb_agg(jsonb_build_array(period::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, pud, mau_pud, days)), '[]'::jsonb),
        coalesce(jsonb_agg(distinct period::text), '[]'::jsonb)
      into data_rows, period_list from g;
  end case;
  -- Danh sách kỳ phải có thứ tự để ma trận dựng đúng chiều thời gian.
  select coalesce(jsonb_agg(p order by p), '[]'::jsonb) into period_list from jsonb_array_elements_text(period_list) p;
  return jsonb_build_object('dataset', dataset, 'grain', grain, 'date_from', d_from, 'date_to', d_to,
    'weeks', period_list, 'cols', col_list, 'rows', data_rows);
end $$;

-- Danh sách lựa chọn cho bộ lọc + ngày mới nhất/cũ nhất của bảng chi tiết. Cửa sổ 30 ngày gần nhất.
create or replace function public.get_kas_detail_options(dataset text)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '15s' as $$
declare
  latest date; earliest date; p jsonb; l jsonb := '[]'::jsonb;
begin
  if auth.uid() is null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  case dataset
    when 'pick' then
      select min(report_date), max(report_date) into earliest, latest from public.kas_pick_detail;
      select coalesce(jsonb_agg(province order by province), '[]'::jsonb) into p from (
        select distinct province from public.kas_pick_detail
        where report_date > latest - 30 and province is not null and province <> '') s;
    when 'reverse' then
      select min(report_date), max(report_date) into earliest, latest from public.kas_reverse_detail;
      select coalesce(jsonb_agg(province order by province), '[]'::jsonb) into p from (
        select distinct province from public.kas_reverse_detail
        where report_date > latest - 30 and province is not null and province <> '') s;
    when 'deli' then
      select min(report_date), max(report_date) into earliest, latest from public.kas_deli_detail;
      select coalesce(jsonb_agg(province order by province), '[]'::jsonb) into p from (
        select distinct province from public.kas_deli_detail
        where report_date > latest - 30 and province is not null and province <> '') s;
      select coalesce(jsonb_agg(lane order by lane), '[]'::jsonb) into l from (
        select distinct lane from public.kas_deli_detail
        where report_date > latest - 30 and lane is not null and lane <> '') s;
    when 'fd' then
      select min(report_date), max(report_date) into earliest, latest from public.kas_fd_detail;
      select coalesce(jsonb_agg(province order by province), '[]'::jsonb) into p from (
        select distinct province from public.kas_fd_detail
        where report_date > latest - 30 and province is not null and province <> '') s;
      select coalesce(jsonb_agg(lane order by lane), '[]'::jsonb) into l from (
        select distinct lane from public.kas_fd_detail
        where report_date > latest - 30 and lane is not null and lane <> '') s;
    else raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'min_date', earliest, 'max_date', latest,
    'provinces', coalesce(p, '[]'::jsonb), 'lanes', l);
end $$;

-- Retention giống kas_*_history (90 ngày, tối thiểu 70).
create or replace function public.prune_kas_detail(keep_days integer default 90)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5min' as $$
declare cutoff date; a bigint; b bigint; c bigint; d bigint;
begin
  if keep_days is null or keep_days < 70 then raise exception 'keep_days must be at least 70'; end if;
  cutoff := (now() at time zone 'Asia/Ho_Chi_Minh')::date - keep_days;
  delete from public.kas_pick_detail where report_date < cutoff; get diagnostics a = row_count;
  delete from public.kas_deli_detail where report_date < cutoff; get diagnostics b = row_count;
  delete from public.kas_fd_detail where report_date < cutoff; get diagnostics c = row_count;
  delete from public.kas_reverse_detail where report_date < cutoff; get diagnostics d = row_count;
  return jsonb_build_object('cutoff', cutoff, 'pick', a, 'deli', b, 'fd', c, 'reverse', d);
end $$;

revoke all on function public.upsert_kas_pick_detail(date, date, jsonb), public.upsert_kas_deli_detail(date, date, jsonb),
  public.upsert_kas_fd_detail(date, date, jsonb), public.upsert_kas_reverse_detail(date, date, jsonb),
  public.prune_kas_detail(integer), public.get_kas_detail_compact(text, text, date, date, text[], text[]),
  public.get_kas_detail_options(text) from public, anon, authenticated;
grant execute on function public.upsert_kas_pick_detail(date, date, jsonb), public.upsert_kas_deli_detail(date, date, jsonb),
  public.upsert_kas_fd_detail(date, date, jsonb), public.upsert_kas_reverse_detail(date, date, jsonb),
  public.prune_kas_detail(integer) to service_role;
grant execute on function public.get_kas_detail_compact(text, text, date, date, text[], text[]),
  public.get_kas_detail_options(text) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune_kas_detail_daily', '40 20 * * *', 'select public.prune_kas_detail(90)');
  end if;
end $$;
