-- Bảng dài hạn cho Pick (hub-ngày), nuôi bằng backfill một lần và upsert hằng ngày.
-- Tách khỏi kas_pick_data: bảng đó giữ đúng cửa sổ D-14..D-1 và có cột benchmark, nhiều nơi
-- đang đọc cả bảng (dashboard, snapshot n8n, RPC chat). Bảng này không bao giờ xoá theo cửa sổ.
-- Không có benchmark (best_l6w_*, sameday_lm_*): hai nhóm này so theo 46 ngày và cùng ngày
-- tháng trước, không tính được khi đổi range.
-- Thiết kế và số liệu thử: docs/tech-debt.md mục 1.
create table if not exists public.kas_pick_history (
  id bigint generated always as identity primary key,
  report_date date not null,
  -- Thứ Hai của tuần chứa report_date, cùng quy ước date_trunc('week') của StarRocks.
  -- Không dùng date_trunc: ép date sang timestamptz phụ thuộc múi giờ nên không immutable.
  week_start date generated always as (report_date - (extract(isodow from report_date)::int - 1)) stored,
  region text,
  hub text,
  hub_type text,
  client_name text,
  mau_pu numeric,
  ontime_pu_1st numeric,
  ontime_pu_opr numeric,
  synced_at timestamptz not null default now(),
  -- Khoá tự nhiên của Hub_Day (GROUP BY ngày, region, hub, hub_type, client).
  -- NULLS NOT DISTINCT vì region có thể rỗng.
  constraint kas_pick_history_key unique nulls not distinct (report_date, region, hub, hub_type, client_name)
);

create index if not exists kas_pick_history_week_idx on public.kas_pick_history (week_start);

alter table public.kas_pick_history enable row level security;
revoke all on public.kas_pick_history from public, anon, authenticated;
grant select, insert, update, delete on public.kas_pick_history to service_role;

-- Upsert theo lô, không xoá. Chỉ ghi dòng mới hoặc dòng có giá trị đổi, nên chạy lại cùng dữ liệu
-- là no-op (không đổi synced_at). Mỗi lô tối đa 20.000 dòng.
create or replace function public.upsert_kas_pick_history(rows jsonb)
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
  create temporary table pick_history_incoming on commit drop as
  select r.report_date, r.region, r.hub, r.hub_type, r.client_name, r.mau_pu, r.ontime_pu_1st, r.ontime_pu_opr
  from jsonb_populate_recordset(null::public.kas_pick_history, rows) r;
  if exists (select 1 from pg_temp.pick_history_incoming where report_date is null) then
    raise exception 'Row without report_date';
  end if;
  -- Hai dòng cùng khoá trong một lô là lỗi nguồn, không để ON CONFLICT gộp ngầm.
  select count(*) into distinct_n from (
    select 1 from pg_temp.pick_history_incoming
    group by report_date, region, hub, hub_type, client_name) k;
  if distinct_n <> total_n then
    raise exception 'Duplicate key in batch: % rows, % distinct keys', total_n, distinct_n;
  end if;
  with up as (
    insert into public.kas_pick_history as t (report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr)
    select report_date, region, hub, hub_type, client_name, mau_pu, ontime_pu_1st, ontime_pu_opr
    from pg_temp.pick_history_incoming
    on conflict on constraint kas_pick_history_key do update
      set mau_pu = excluded.mau_pu, ontime_pu_1st = excluded.ontime_pu_1st,
          ontime_pu_opr = excluded.ontime_pu_opr, synced_at = now()
      where (t.mau_pu, t.ontime_pu_1st, t.ontime_pu_opr)
        is distinct from (excluded.mau_pu, excluded.ontime_pu_1st, excluded.ontime_pu_opr)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
  into inserted_n, updated_n from up;
  drop table pg_temp.pick_history_incoming;
  return jsonb_build_object('rows', total_n, 'inserted', inserted_n, 'updated', updated_n,
    'unchanged', total_n - inserted_n - updated_n);
end $$;

revoke all on function public.upsert_kas_pick_history(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_kas_pick_history(jsonb) to service_role;
