-- Bảng lịch sử Deli và FD (cùng khuôn kas_pick_history), RPC đọc theo tuần cho app và retention.
-- Thiết kế: docs/ops-history-sync.md. Không có cột benchmark (best_l6w_*, sameday_lm_*).

create table if not exists public.kas_deli_history (
  id bigint generated always as identity primary key,
  report_date date not null,
  -- Thứ Hai của tuần chứa report_date. Không dùng date_trunc (không immutable với date).
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text,
  wh_id text,
  hub text,
  hub_type text,
  client_name text,
  mau_deli numeric,
  ontime_deli_1st numeric,
  ontime_deli_odr numeric,
  synced_at timestamptz not null default now(),
  constraint kas_deli_history_key unique nulls not distinct (report_date, region, wh_id, hub, hub_type, client_name)
);

create table if not exists public.kas_fd_history (
  id bigint generated always as identity primary key,
  report_date date not null,
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text,
  wh_id text,
  deliverywh text,
  hub_type text,
  client_name text,
  mau_fd numeric,
  fd_hoan_thanh numeric,
  synced_at timestamptz not null default now(),
  constraint kas_fd_history_key unique nulls not distinct (report_date, region, wh_id, deliverywh, hub_type, client_name)
);

create index if not exists kas_deli_history_week_idx on public.kas_deli_history (week_start);
create index if not exists kas_fd_history_week_idx on public.kas_fd_history (week_start);

alter table public.kas_deli_history enable row level security;
alter table public.kas_fd_history enable row level security;
revoke all on public.kas_deli_history, public.kas_fd_history from public, anon, authenticated;
grant select, insert, update, delete on public.kas_deli_history, public.kas_fd_history to service_role;

-- Upsert theo lô, không xoá, chạy lại là no-op. Cùng hành vi upsert_kas_pick_history.
create or replace function public.upsert_kas_deli_history(rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare
  total_n integer; distinct_n integer; inserted_n integer; updated_n integer;
begin
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then
    raise exception 'Batch too large: % rows (max 20000)', total_n;
  end if;
  create temporary table deli_history_incoming on commit drop as
  select r.report_date, r.region, r.wh_id, r.hub, r.hub_type, r.client_name,
    r.mau_deli, r.ontime_deli_1st, r.ontime_deli_odr
  from jsonb_populate_recordset(null::public.kas_deli_history, rows) r;
  if exists (select 1 from pg_temp.deli_history_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  select count(*) into distinct_n from (
    select 1 from pg_temp.deli_history_incoming
    group by report_date, region, wh_id, hub, hub_type, client_name) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  with up as (
    insert into public.kas_deli_history as t (report_date, region, wh_id, hub, hub_type, client_name,
      mau_deli, ontime_deli_1st, ontime_deli_odr)
    select report_date, region, wh_id, hub, hub_type, client_name, mau_deli, ontime_deli_1st, ontime_deli_odr
    from pg_temp.deli_history_incoming
    on conflict on constraint kas_deli_history_key do update
      set mau_deli = excluded.mau_deli, ontime_deli_1st = excluded.ontime_deli_1st,
          ontime_deli_odr = excluded.ontime_deli_odr, synced_at = now()
      where (t.mau_deli, t.ontime_deli_1st, t.ontime_deli_odr)
        is distinct from (excluded.mau_deli, excluded.ontime_deli_1st, excluded.ontime_deli_odr)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
  into inserted_n, updated_n from up;
  drop table pg_temp.deli_history_incoming;
  return jsonb_build_object('rows', total_n, 'inserted', inserted_n, 'updated', updated_n,
    'unchanged', total_n - inserted_n - updated_n);
end $$;

create or replace function public.upsert_kas_fd_history(rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare
  total_n integer; distinct_n integer; inserted_n integer; updated_n integer;
begin
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then
    raise exception 'Batch too large: % rows (max 20000)', total_n;
  end if;
  create temporary table fd_history_incoming on commit drop as
  select r.report_date, r.region, r.wh_id, r.deliverywh, r.hub_type, r.client_name,
    r.mau_fd, r.fd_hoan_thanh
  from jsonb_populate_recordset(null::public.kas_fd_history, rows) r;
  if exists (select 1 from pg_temp.fd_history_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  select count(*) into distinct_n from (
    select 1 from pg_temp.fd_history_incoming
    group by report_date, region, wh_id, deliverywh, hub_type, client_name) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  with up as (
    insert into public.kas_fd_history as t (report_date, region, wh_id, deliverywh, hub_type, client_name,
      mau_fd, fd_hoan_thanh)
    select report_date, region, wh_id, deliverywh, hub_type, client_name, mau_fd, fd_hoan_thanh
    from pg_temp.fd_history_incoming
    on conflict on constraint kas_fd_history_key do update
      set mau_fd = excluded.mau_fd, fd_hoan_thanh = excluded.fd_hoan_thanh, synced_at = now()
      where (t.mau_fd, t.fd_hoan_thanh) is distinct from (excluded.mau_fd, excluded.fd_hoan_thanh)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
  into inserted_n, updated_n from up;
  drop table pg_temp.fd_history_incoming;
  return jsonb_build_object('rows', total_n, 'inserted', inserted_n, 'updated', updated_n,
    'unchanged', total_n - inserted_n - updated_n);
end $$;

-- RPC đọc cho chế độ "Theo tuần". Trả một jsonb duy nhất (không dính giới hạn 1000 dòng của
-- PostgREST) gồm các tuần lấy được và các dòng hub-tuần. Dòng mang đúng tên cột của dòng hàng ngày
-- (mau_pu, ontime_pu_1st, ... ; report_date = thứ Hai của tuần) để app chạy lại
-- normalizeDashboardRows (KA, CK, GXT theo hub/wh_id) rồi cộng tuần như bình thường.
-- Chỉ cho người dùng đã đăng nhập (authenticated), giống chính sách đọc kas_*_data.
create or replace function public.get_kas_weekly_rows(dataset text, weeks integer default 9)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  latest date; first_week date; week_list jsonb; data_rows jsonb;
begin
  if weeks is null or weeks < 1 or weeks > 16 then
    raise exception 'weeks must be between 1 and 16';
  end if;
  case dataset
    when 'pick' then
      select max(week_start) into latest from public.kas_pick_history;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into data_rows from (
        select week_start::text as report_date, region, hub, hub_type, client_name,
          sum(mau_pu) as mau_pu, sum(ontime_pu_1st) as ontime_pu_1st, sum(ontime_pu_opr) as ontime_pu_opr,
          count(distinct report_date) as days
        from public.kas_pick_history where week_start >= first_week
        group by week_start, region, hub, hub_type, client_name) t;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_pick_history where week_start >= first_week) s;
    when 'deli' then
      select max(week_start) into latest from public.kas_deli_history;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into data_rows from (
        select week_start::text as report_date, region, wh_id, hub, hub_type, client_name,
          sum(mau_deli) as mau_deli, sum(ontime_deli_1st) as ontime_deli_1st, sum(ontime_deli_odr) as ontime_deli_odr,
          count(distinct report_date) as days
        from public.kas_deli_history where week_start >= first_week
        group by week_start, region, wh_id, hub, hub_type, client_name) t;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_deli_history where week_start >= first_week) s;
    when 'fd' then
      select max(week_start) into latest from public.kas_fd_history;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into data_rows from (
        select week_start::text as report_date, region, wh_id, deliverywh, hub_type, client_name,
          sum(mau_fd) as mau_fd, sum(fd_hoan_thanh) as fd_hoan_thanh,
          count(distinct report_date) as days
        from public.kas_fd_history where week_start >= first_week
        group by week_start, region, wh_id, deliverywh, hub_type, client_name) t;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_fd_history where week_start >= first_week) s;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'weeks', week_list, 'rows', data_rows);
end $$;

-- Retention: giữ keep_days ngày gần nhất (theo giờ Việt Nam). Tối thiểu 70 ngày để không cắt
-- vào 8 tuần nguyên + tuần hiện tại của chế độ theo tuần.
create or replace function public.prune_kas_history(keep_days integer default 90)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '5min' as $$
declare
  cutoff date; pick_n bigint; deli_n bigint; fd_n bigint;
begin
  if keep_days is null or keep_days < 70 then
    raise exception 'keep_days must be at least 70';
  end if;
  cutoff := (now() at time zone 'Asia/Ho_Chi_Minh')::date - keep_days;
  delete from public.kas_pick_history where report_date < cutoff;
  get diagnostics pick_n = row_count;
  delete from public.kas_deli_history where report_date < cutoff;
  get diagnostics deli_n = row_count;
  delete from public.kas_fd_history where report_date < cutoff;
  get diagnostics fd_n = row_count;
  return jsonb_build_object('cutoff', cutoff, 'pick', pick_n, 'deli', deli_n, 'fd', fd_n);
end $$;

revoke all on function public.upsert_kas_deli_history(jsonb), public.upsert_kas_fd_history(jsonb),
  public.prune_kas_history(integer), public.get_kas_weekly_rows(text, integer) from public, anon, authenticated;
grant execute on function public.upsert_kas_deli_history(jsonb), public.upsert_kas_fd_history(jsonb),
  public.prune_kas_history(integer) to service_role;
grant execute on function public.get_kas_weekly_rows(text, integer) to authenticated, service_role;

-- Dọn hằng ngày lúc 03:30 giờ Việt Nam (20:30 UTC). Chỉ lên lịch khi có pg_cron.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune_kas_history_daily', '30 20 * * *', 'select public.prune_kas_history(90)');
  end if;
end $$;
