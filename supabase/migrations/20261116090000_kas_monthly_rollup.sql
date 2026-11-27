-- Bảng cộng sẵn theo THÁNG cho Pick/Deli/FD, phục vụ chế độ "Theo tháng" của Chi tiết Vùng/Hub.
-- Khác bảng tuần ở một điểm quan trọng: bảng tháng KHÔNG bị cắt. kas_*_history chỉ giữ 90 ngày
-- (prune_kas_history), nên bảng tháng phải sống sót khi dòng ngày bị xoá:
--   * Trigger chỉ chạy khi INSERT/UPDATE bảng lịch sử. Không có trigger DELETE/TRUNCATE.
--   * refresh_kas_*_monthly chỉ tính lại tháng mà bảng lịch sử còn phủ từ ngày 1
--     (ngày cũ nhất của bảng lịch sử <= đầu tháng). Tháng đã bị cắt dở thì đóng băng, giữ nguyên số đã cộng.
--   * Điền ban đầu dùng force = true để ghi cả tháng đầu tiên (từ 18/08/2026, không đủ ngày).
-- Cột `days` là số ngày có dữ liệu trong tháng, UI dùng để ghi "chưa đủ ngày". Thiết kế: docs/ops-history-sync.md.

create table if not exists public.kas_pick_monthly (
  month_start date not null,
  region text, hub text, hub_type text, client_name text,
  mau_pu numeric, ontime_pu_1st numeric, ontime_pu_opr numeric,
  days integer not null,
  constraint kas_pick_monthly_key unique nulls not distinct (month_start, region, hub, hub_type, client_name)
);
create table if not exists public.kas_deli_monthly (
  month_start date not null,
  region text, wh_id text, hub text, hub_type text, client_name text,
  mau_deli numeric, ontime_deli_1st numeric, ontime_deli_odr numeric,
  days integer not null,
  constraint kas_deli_monthly_key unique nulls not distinct (month_start, region, wh_id, hub, hub_type, client_name)
);
create table if not exists public.kas_fd_monthly (
  month_start date not null,
  region text, wh_id text, deliverywh text, hub_type text, client_name text,
  mau_fd numeric, fd_hoan_thanh numeric,
  days integer not null,
  constraint kas_fd_monthly_key unique nulls not distinct (month_start, region, wh_id, deliverywh, hub_type, client_name)
);

alter table public.kas_pick_monthly enable row level security;
alter table public.kas_deli_monthly enable row level security;
alter table public.kas_fd_monthly enable row level security;
revoke all on public.kas_pick_monthly, public.kas_deli_monthly, public.kas_fd_monthly from public, anon, authenticated;
grant select, insert, update, delete on public.kas_pick_monthly, public.kas_deli_monthly, public.kas_fd_monthly to service_role;

-- Tính lại các tháng được truyền vào. Không force: bỏ qua tháng bảng lịch sử không còn phủ từ ngày 1 (đã đóng băng).
create or replace function public.refresh_kas_pick_monthly(months date[], force boolean default false)
returns void language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare oldest date; ok date[];
begin
  select min(report_date) into oldest from public.kas_pick_history;
  select coalesce(array_agg(m), '{}') into ok from unnest(months) m where force or oldest <= m;
  delete from public.kas_pick_monthly where month_start = any(ok);
  insert into public.kas_pick_monthly (month_start, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, days)
  select date_trunc('month', report_date)::date, region, hub, hub_type, client_name,
    sum(mau_pu), sum(ontime_pu_1st), sum(ontime_pu_opr), count(distinct report_date)
  from public.kas_pick_history where date_trunc('month', report_date)::date = any(ok)
  group by 1, region, hub, hub_type, client_name;
end $$;

create or replace function public.refresh_kas_deli_monthly(months date[], force boolean default false)
returns void language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare oldest date; ok date[];
begin
  select min(report_date) into oldest from public.kas_deli_history;
  select coalesce(array_agg(m), '{}') into ok from unnest(months) m where force or oldest <= m;
  delete from public.kas_deli_monthly where month_start = any(ok);
  insert into public.kas_deli_monthly (month_start, region, wh_id, hub, hub_type, client_name, mau_deli, ontime_deli_1st, ontime_deli_odr, days)
  select date_trunc('month', report_date)::date, region, wh_id, hub, hub_type, client_name,
    sum(mau_deli), sum(ontime_deli_1st), sum(ontime_deli_odr), count(distinct report_date)
  from public.kas_deli_history where date_trunc('month', report_date)::date = any(ok)
  group by 1, region, wh_id, hub, hub_type, client_name;
end $$;

create or replace function public.refresh_kas_fd_monthly(months date[], force boolean default false)
returns void language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare oldest date; ok date[];
begin
  select min(report_date) into oldest from public.kas_fd_history;
  select coalesce(array_agg(m), '{}') into ok from unnest(months) m where force or oldest <= m;
  delete from public.kas_fd_monthly where month_start = any(ok);
  insert into public.kas_fd_monthly (month_start, region, wh_id, deliverywh, hub_type, client_name, mau_fd, fd_hoan_thanh, days)
  select date_trunc('month', report_date)::date, region, wh_id, deliverywh, hub_type, client_name,
    sum(mau_fd), sum(fd_hoan_thanh), count(distinct report_date)
  from public.kas_fd_history where date_trunc('month', report_date)::date = any(ok)
  group by 1, region, wh_id, deliverywh, hub_type, client_name;
end $$;

-- Trigger mức câu lệnh, chỉ INSERT và UPDATE (xem ghi chú đầu file: không có DELETE/TRUNCATE).
create or replace function public.kas_pick_monthly_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_kas_pick_monthly(array(select distinct date_trunc('month', report_date)::date from changed));
  return null;
end $$;
create or replace function public.kas_deli_monthly_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_kas_deli_monthly(array(select distinct date_trunc('month', report_date)::date from changed));
  return null;
end $$;
create or replace function public.kas_fd_monthly_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_kas_fd_monthly(array(select distinct date_trunc('month', report_date)::date from changed));
  return null;
end $$;

drop trigger if exists kas_pick_monthly_ins on public.kas_pick_history;
drop trigger if exists kas_pick_monthly_upd on public.kas_pick_history;
create trigger kas_pick_monthly_ins after insert on public.kas_pick_history
  referencing new table as changed for each statement execute function public.kas_pick_monthly_trg();
create trigger kas_pick_monthly_upd after update on public.kas_pick_history
  referencing new table as changed for each statement execute function public.kas_pick_monthly_trg();

drop trigger if exists kas_deli_monthly_ins on public.kas_deli_history;
drop trigger if exists kas_deli_monthly_upd on public.kas_deli_history;
create trigger kas_deli_monthly_ins after insert on public.kas_deli_history
  referencing new table as changed for each statement execute function public.kas_deli_monthly_trg();
create trigger kas_deli_monthly_upd after update on public.kas_deli_history
  referencing new table as changed for each statement execute function public.kas_deli_monthly_trg();

drop trigger if exists kas_fd_monthly_ins on public.kas_fd_history;
drop trigger if exists kas_fd_monthly_upd on public.kas_fd_history;
create trigger kas_fd_monthly_ins after insert on public.kas_fd_history
  referencing new table as changed for each statement execute function public.kas_fd_monthly_trg();
create trigger kas_fd_monthly_upd after update on public.kas_fd_history
  referencing new table as changed for each statement execute function public.kas_fd_monthly_trg();

-- Điền dữ liệu hiện có, force = true để lấy cả tháng đầu (18/08). Chạy lại được nhưng CHỈ an toàn khi bảng
-- lịch sử còn đủ các tháng được tính lại: chạy sau khi prune đã cắt dở một tháng sẽ ghi đè tháng đó bằng số thiếu.
select public.refresh_kas_pick_monthly(array(select distinct date_trunc('month', report_date)::date from public.kas_pick_history), true);
select public.refresh_kas_deli_monthly(array(select distinct date_trunc('month', report_date)::date from public.kas_deli_history), true);
select public.refresh_kas_fd_monthly(array(select distinct date_trunc('month', report_date)::date from public.kas_fd_history), true);

-- RPC đọc, dạng gọn như get_kas_weekly_compact. `months` là số tháng gần nhất có dữ liệu (tối đa 24).
-- report_date = ngày đầu tháng, nên app chạy lại normalizeDashboardRows như bảng tuần.
create or replace function public.get_kas_monthly_compact(dataset text, months integer default 6)
returns jsonb language plpgsql stable security definer set search_path = '' set statement_timeout = '30s' as $$
declare
  latest date; first_month date; month_list jsonb; data_rows jsonb; col_list jsonb;
begin
  if months is null or months < 1 or months > 24 then
    raise exception 'months must be between 1 and 24';
  end if;
  case dataset
    when 'pick' then
      col_list := '["report_date","region","hub","hub_type","client_name","mau_pu","ontime_pu_1st","ontime_pu_opr","days"]';
      select max(month_start) into latest from public.kas_pick_monthly;
      first_month := (latest - make_interval(months => months - 1))::date;
      select coalesce(jsonb_agg(jsonb_build_array(month_start::text, region, hub, hub_type, client_name,
          mau_pu, ontime_pu_1st, ontime_pu_opr, days)), '[]'::jsonb)
        into data_rows from public.kas_pick_monthly where month_start >= first_month;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into month_list from (
        select distinct month_start::text as w from public.kas_pick_monthly where month_start >= first_month) s;
    when 'deli' then
      col_list := '["report_date","region","wh_id","hub","hub_type","client_name","mau_deli","ontime_deli_1st","ontime_deli_odr","days"]';
      select max(month_start) into latest from public.kas_deli_monthly;
      first_month := (latest - make_interval(months => months - 1))::date;
      select coalesce(jsonb_agg(jsonb_build_array(month_start::text, region, wh_id, hub, hub_type, client_name,
          mau_deli, ontime_deli_1st, ontime_deli_odr, days)), '[]'::jsonb)
        into data_rows from public.kas_deli_monthly where month_start >= first_month;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into month_list from (
        select distinct month_start::text as w from public.kas_deli_monthly where month_start >= first_month) s;
    when 'fd' then
      col_list := '["report_date","region","wh_id","deliverywh","hub_type","client_name","mau_fd","fd_hoan_thanh","days"]';
      select max(month_start) into latest from public.kas_fd_monthly;
      first_month := (latest - make_interval(months => months - 1))::date;
      select coalesce(jsonb_agg(jsonb_build_array(month_start::text, region, wh_id, deliverywh, hub_type, client_name,
          mau_fd, fd_hoan_thanh, days)), '[]'::jsonb)
        into data_rows from public.kas_fd_monthly where month_start >= first_month;
      select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into month_list from (
        select distinct month_start::text as w from public.kas_fd_monthly where month_start >= first_month) s;
    else
      raise exception 'Unsupported dataset: %', dataset;
  end case;
  return jsonb_build_object('dataset', dataset, 'months', month_list, 'cols', col_list, 'rows', data_rows);
end $$;

revoke all on function public.refresh_kas_pick_monthly(date[], boolean), public.refresh_kas_deli_monthly(date[], boolean),
  public.refresh_kas_fd_monthly(date[], boolean), public.kas_pick_monthly_trg(), public.kas_deli_monthly_trg(),
  public.kas_fd_monthly_trg(), public.get_kas_monthly_compact(text, integer) from public, anon, authenticated;
grant execute on function public.refresh_kas_pick_monthly(date[], boolean), public.refresh_kas_deli_monthly(date[], boolean),
  public.refresh_kas_fd_monthly(date[], boolean) to service_role;
grant execute on function public.get_kas_monthly_compact(text, integer) to authenticated, service_role;
