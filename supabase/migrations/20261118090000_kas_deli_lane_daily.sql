-- KAS-314: 1st Deli / ODR theo lane (ngày x lane x client).
-- Nguồn: Dtm_KA_Shopee (StarRocks, có cột lane theo tên tỉnh mới); kas_deli_* không có cột lane.
-- Tử số/mẫu số cùng khuôn kas_deli_history: ontime_deli_1st / ontime_deli_odr chia mau_deli.
-- Việc đổ dữ liệu (sync) chạy riêng; migration này chỉ dựng bảng, quyền đọc và RPC upsert.

create table if not exists public.kas_deli_lane_daily (
  id bigint generated always as identity primary key,
  report_date date not null,
  lane text not null,
  client_name text not null,
  mau_deli numeric,
  ontime_deli_1st numeric,
  ontime_deli_odr numeric,
  synced_at timestamptz not null default now(),
  constraint kas_deli_lane_daily_key unique (report_date, lane, client_name)
);

create index if not exists kas_deli_lane_daily_date_idx on public.kas_deli_lane_daily (report_date);

alter table public.kas_deli_lane_daily enable row level security;

create policy "authenticated can select kas_deli_lane_daily"
  on public.kas_deli_lane_daily for select
  to authenticated
  using (true);

revoke all on public.kas_deli_lane_daily from public, anon;
grant select on public.kas_deli_lane_daily to authenticated;
grant select, insert, update, delete on public.kas_deli_lane_daily to service_role;

-- Upsert theo lô, không xoá; chạy lại là no-op.
create or replace function public.upsert_kas_deli_lane_daily(rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '2min' as $$
declare
  total_n integer;
  affected_n integer;
begin
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'A nonempty row array is required';
  end if;
  total_n := jsonb_array_length(rows);
  if total_n > 20000 then
    raise exception 'Batch too large: % rows (max 20000)', total_n;
  end if;

  insert into public.kas_deli_lane_daily as t (report_date, lane, client_name, mau_deli, ontime_deli_1st, ontime_deli_odr)
  select r.report_date, r.lane, r.client_name, r.mau_deli, r.ontime_deli_1st, r.ontime_deli_odr
  from jsonb_populate_recordset(null::public.kas_deli_lane_daily, rows) r
  where r.report_date is not null and r.lane is not null and r.client_name is not null
  on conflict (report_date, lane, client_name) do update
    set mau_deli = excluded.mau_deli,
        ontime_deli_1st = excluded.ontime_deli_1st,
        ontime_deli_odr = excluded.ontime_deli_odr,
        synced_at = now()
    where (t.mau_deli, t.ontime_deli_1st, t.ontime_deli_odr)
      is distinct from (excluded.mau_deli, excluded.ontime_deli_1st, excluded.ontime_deli_odr);
  get diagnostics affected_n = row_count;

  return jsonb_build_object('received', total_n, 'changed', affected_n);
end;
$$;

revoke all on function public.upsert_kas_deli_lane_daily(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_kas_deli_lane_daily(jsonb) to service_role;
