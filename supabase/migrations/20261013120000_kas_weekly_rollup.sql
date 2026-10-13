-- Bảng cộng sẵn theo tuần cho Pick/Deli/FD. get_kas_weekly_rows trước đây GROUP BY ~120 nghìn dòng
-- hub-ngày mỗi lần gọi (~10 giây mỗi bảng trên DB hiện tại); giờ chỉ đọc ~20 nghìn dòng hub-tuần.
-- Bảng được giữ đồng bộ bằng trigger mức câu lệnh trên bảng lịch sử: mỗi INSERT/UPDATE/DELETE
-- tính lại đúng các tuần bị chạm (upsert, backfill và prune_kas_history đều đi qua đây).
-- Thiết kế: docs/ops-history-sync.md.

create table if not exists public.kas_pick_weekly (
  week_start date not null,
  region text, hub text, hub_type text, client_name text,
  mau_pu numeric, ontime_pu_1st numeric, ontime_pu_opr numeric,
  days integer not null,
  constraint kas_pick_weekly_key unique nulls not distinct (week_start, region, hub, hub_type, client_name)
);
create table if not exists public.kas_deli_weekly (
  week_start date not null,
  region text, wh_id text, hub text, hub_type text, client_name text,
  mau_deli numeric, ontime_deli_1st numeric, ontime_deli_odr numeric,
  days integer not null,
  constraint kas_deli_weekly_key unique nulls not distinct (week_start, region, wh_id, hub, hub_type, client_name)
);
create table if not exists public.kas_fd_weekly (
  week_start date not null,
  region text, wh_id text, deliverywh text, hub_type text, client_name text,
  mau_fd numeric, fd_hoan_thanh numeric,
  days integer not null,
  constraint kas_fd_weekly_key unique nulls not distinct (week_start, region, wh_id, deliverywh, hub_type, client_name)
);

alter table public.kas_pick_weekly enable row level security;
alter table public.kas_deli_weekly enable row level security;
alter table public.kas_fd_weekly enable row level security;
revoke all on public.kas_pick_weekly, public.kas_deli_weekly, public.kas_fd_weekly from public, anon, authenticated;
grant select, insert, update, delete on public.kas_pick_weekly, public.kas_deli_weekly, public.kas_fd_weekly to service_role;

-- Tính lại các tuần được truyền vào từ bảng lịch sử. Tuần không còn dòng lịch sử nào thì bị xoá khỏi bảng tuần.
create or replace function public.refresh_kas_pick_weekly(weeks date[])
returns void language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
begin
  delete from public.kas_pick_weekly where week_start = any(weeks);
  insert into public.kas_pick_weekly (week_start, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, days)
  select week_start, region, hub, hub_type, client_name, sum(mau_pu), sum(ontime_pu_1st), sum(ontime_pu_opr),
    count(distinct report_date)
  from public.kas_pick_history where week_start = any(weeks)
  group by week_start, region, hub, hub_type, client_name;
end $$;

create or replace function public.refresh_kas_deli_weekly(weeks date[])
returns void language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
begin
  delete from public.kas_deli_weekly where week_start = any(weeks);
  insert into public.kas_deli_weekly (week_start, region, wh_id, hub, hub_type, client_name, mau_deli, ontime_deli_1st, ontime_deli_odr, days)
  select week_start, region, wh_id, hub, hub_type, client_name, sum(mau_deli), sum(ontime_deli_1st), sum(ontime_deli_odr),
    count(distinct report_date)
  from public.kas_deli_history where week_start = any(weeks)
  group by week_start, region, wh_id, hub, hub_type, client_name;
end $$;

create or replace function public.refresh_kas_fd_weekly(weeks date[])
returns void language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
begin
  delete from public.kas_fd_weekly where week_start = any(weeks);
  insert into public.kas_fd_weekly (week_start, region, wh_id, deliverywh, hub_type, client_name, mau_fd, fd_hoan_thanh, days)
  select week_start, region, wh_id, deliverywh, hub_type, client_name, sum(mau_fd), sum(fd_hoan_thanh),
    count(distinct report_date)
  from public.kas_fd_history where week_start = any(weeks)
  group by week_start, region, wh_id, deliverywh, hub_type, client_name;
end $$;

-- Trigger mức câu lệnh. Mỗi trigger dùng bảng chuyển tiếp tên `changed` (INSERT/UPDATE: dòng mới,
-- DELETE: dòng cũ). UPDATE không đổi được week_start vì report_date nằm trong khoá tự nhiên.
create or replace function public.kas_pick_weekly_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_kas_pick_weekly(array(select distinct week_start from changed));
  return null;
end $$;
create or replace function public.kas_deli_weekly_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_kas_deli_weekly(array(select distinct week_start from changed));
  return null;
end $$;
create or replace function public.kas_fd_weekly_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_kas_fd_weekly(array(select distinct week_start from changed));
  return null;
end $$;

drop trigger if exists kas_pick_weekly_ins on public.kas_pick_history;
drop trigger if exists kas_pick_weekly_upd on public.kas_pick_history;
drop trigger if exists kas_pick_weekly_del on public.kas_pick_history;
create trigger kas_pick_weekly_ins after insert on public.kas_pick_history
  referencing new table as changed for each statement execute function public.kas_pick_weekly_trg();
create trigger kas_pick_weekly_upd after update on public.kas_pick_history
  referencing new table as changed for each statement execute function public.kas_pick_weekly_trg();
create trigger kas_pick_weekly_del after delete on public.kas_pick_history
  referencing old table as changed for each statement execute function public.kas_pick_weekly_trg();

drop trigger if exists kas_deli_weekly_ins on public.kas_deli_history;
drop trigger if exists kas_deli_weekly_upd on public.kas_deli_history;
drop trigger if exists kas_deli_weekly_del on public.kas_deli_history;
create trigger kas_deli_weekly_ins after insert on public.kas_deli_history
  referencing new table as changed for each statement execute function public.kas_deli_weekly_trg();
create trigger kas_deli_weekly_upd after update on public.kas_deli_history
  referencing new table as changed for each statement execute function public.kas_deli_weekly_trg();
create trigger kas_deli_weekly_del after delete on public.kas_deli_history
  referencing old table as changed for each statement execute function public.kas_deli_weekly_trg();

drop trigger if exists kas_fd_weekly_ins on public.kas_fd_history;
drop trigger if exists kas_fd_weekly_upd on public.kas_fd_history;
drop trigger if exists kas_fd_weekly_del on public.kas_fd_history;
create trigger kas_fd_weekly_ins after insert on public.kas_fd_history
  referencing new table as changed for each statement execute function public.kas_fd_weekly_trg();
create trigger kas_fd_weekly_upd after update on public.kas_fd_history
  referencing new table as changed for each statement execute function public.kas_fd_weekly_trg();
create trigger kas_fd_weekly_del after delete on public.kas_fd_history
  referencing old table as changed for each statement execute function public.kas_fd_weekly_trg();

-- TRUNCATE không kích hoạt trigger DML, nên cần trigger riêng để bảng tuần không giữ dữ liệu cũ.
create or replace function public.kas_weekly_truncate_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  execute format('truncate table public.%I', replace(tg_table_name, '_history', '_weekly'));
  return null;
end $$;
drop trigger if exists kas_pick_weekly_trunc on public.kas_pick_history;
drop trigger if exists kas_deli_weekly_trunc on public.kas_deli_history;
drop trigger if exists kas_fd_weekly_trunc on public.kas_fd_history;
create trigger kas_pick_weekly_trunc after truncate on public.kas_pick_history
  for each statement execute function public.kas_weekly_truncate_trg();
create trigger kas_deli_weekly_trunc after truncate on public.kas_deli_history
  for each statement execute function public.kas_weekly_truncate_trg();
create trigger kas_fd_weekly_trunc after truncate on public.kas_fd_history
  for each statement execute function public.kas_weekly_truncate_trg();

-- Điền dữ liệu hiện có (chạy lại được: refresh xoá rồi tính lại). Trên DB lớn, chạy từng bảng riêng
-- bằng: select public.refresh_kas_<pick|deli|fd>_weekly(array(select distinct week_start from public.kas_<...>_history));
select public.refresh_kas_pick_weekly(array(select distinct week_start from public.kas_pick_history));
select public.refresh_kas_deli_weekly(array(select distinct week_start from public.kas_deli_history));
select public.refresh_kas_fd_weekly(array(select distinct week_start from public.kas_fd_history));

-- RPC đọc: cùng hình dạng kết quả như bản cũ, nhưng đọc bảng tuần thay vì GROUP BY bảng ngày.
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
      select max(week_start) into latest from public.kas_pick_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into data_rows from (
        select week_start::text as report_date, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, days
        from public.kas_pick_weekly where week_start >= first_week) t;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_pick_weekly where week_start >= first_week) s;
    when 'deli' then
      select max(week_start) into latest from public.kas_deli_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into data_rows from (
        select week_start::text as report_date, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr, days
        from public.kas_deli_weekly where week_start >= first_week) t;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_deli_weekly where week_start >= first_week) s;
    when 'fd' then
      select max(week_start) into latest from public.kas_fd_weekly;
      first_week := latest - (weeks - 1) * 7;
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into data_rows from (
        select week_start::text as report_date, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh, days
        from public.kas_fd_weekly where week_start >= first_week) t;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into week_list from (
        select distinct week_start::text as w from public.kas_fd_weekly where week_start >= first_week) s;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'weeks', week_list, 'rows', data_rows);
end $$;

revoke all on function public.refresh_kas_pick_weekly(date[]), public.refresh_kas_deli_weekly(date[]),
  public.refresh_kas_fd_weekly(date[]), public.kas_pick_weekly_trg(), public.kas_deli_weekly_trg(),
  public.kas_fd_weekly_trg(), public.kas_weekly_truncate_trg() from public, anon, authenticated;
grant execute on function public.refresh_kas_pick_weekly(date[]), public.refresh_kas_deli_weekly(date[]),
  public.refresh_kas_fd_weekly(date[]) to service_role;
