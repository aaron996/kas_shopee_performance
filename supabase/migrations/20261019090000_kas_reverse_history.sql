-- KAS-291: SPE Reverse (client 224845) 1st Pickup / OPR / PUD theo hub-ngày, nuôi bằng backfill một lần (từ 21/06/2026)
-- và replace 14 ngày gần nhất hằng ngày. Cùng cột với kas_pick_history, thêm pud.
-- Không móc vào prune_kas_history (90 ngày): backfill bắt đầu từ 21/06 nên dài hơn retention của Pick/Deli/FD.
create table if not exists public.kas_reverse_history (
  id bigint generated always as identity primary key,
  report_date date not null,
  -- Thứ Hai của tuần chứa report_date, cùng quy ước với kas_pick_history.
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text,
  hub text,
  hub_type text,
  client_name text,
  mau_pu numeric,
  ontime_pu_1st numeric,
  ontime_pu_opr numeric,
  pud numeric,
  synced_at timestamptz not null default now(),
  constraint kas_reverse_history_key unique nulls not distinct (report_date, region, hub, hub_type, client_name)
);

create index if not exists kas_reverse_history_week_idx on public.kas_reverse_history (week_start);

alter table public.kas_reverse_history enable row level security;
revoke all on public.kas_reverse_history from public, anon, authenticated;
grant select, insert, update, delete on public.kas_reverse_history to service_role;

-- Thay toàn bộ dữ liệu trong [date_from, date_to] bằng rows (xoá rồi chèn trong cùng một giao dịch). Khác upsert của Pick:
-- hub bị đổi (DropAtStation) hoặc đơn bị loại khỏi nguồn thì dòng cũ biến mất. Mọi dòng phải nằm trong khoảng,
-- rows không được rỗng (tránh xoá trắng cửa sổ khi nguồn lỗi), tối đa 20.000 dòng, khoá trùng là lỗi.
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
  create temporary table reverse_history_incoming on commit drop as
  select r.report_date, r.region, r.hub, r.hub_type, r.client_name, r.mau_pu, r.ontime_pu_1st, r.ontime_pu_opr, r.pud
  from jsonb_populate_recordset(null::public.kas_reverse_history, rows) r;
  if exists (select 1 from pg_temp.reverse_history_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  if exists (select 1 from pg_temp.reverse_history_incoming where report_date < date_from or report_date > date_to) then
    raise exception 'Row outside window % .. %', date_from, date_to;
  end if;
  select count(*) into distinct_n from (
    select 1 from pg_temp.reverse_history_incoming
    group by report_date, region, hub, hub_type, client_name) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  delete from public.kas_reverse_history where report_date between date_from and date_to;
  get diagnostics deleted_n = row_count;
  insert into public.kas_reverse_history (report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, pud)
  select report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr, pud
  from pg_temp.reverse_history_incoming;
  get diagnostics inserted_n = row_count;
  drop table pg_temp.reverse_history_incoming;
  return jsonb_build_object('rows', total_n, 'deleted', deleted_n, 'inserted', inserted_n);
end $$;

revoke all on function public.replace_kas_reverse_history(date, date, jsonb) from public, anon, authenticated;
grant execute on function public.replace_kas_reverse_history(date, date, jsonb) to service_role;
