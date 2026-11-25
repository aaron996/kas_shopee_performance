-- KAS-314: thêm vùng giao (Toregion_new) vào kas_deli_lane_daily.
-- Grain mới: ngày x lane x vùng giao x client x loại hub. Dòng cũ (vung_giao null) được RPC xoá theo
-- từng ngày ngay khi ngày đó được đẩy lại với vùng giao, nên không bao giờ cộng đôi và không có
-- khoảng trống dữ liệu giữa migration và lần sync kế tiếp.

alter table public.kas_deli_lane_daily add column if not exists vung_giao text;

alter table public.kas_deli_lane_daily drop constraint if exists kas_deli_lane_daily_key;
alter table public.kas_deli_lane_daily
  add constraint kas_deli_lane_daily_key
  unique nulls not distinct (report_date, lane, vung_giao, client_name, hub_type);

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

  -- Ngày nào đã có dòng theo vùng giao thì bỏ dòng cũ chưa có vùng của ngày đó (grain cũ).
  delete from public.kas_deli_lane_daily d
  where d.vung_giao is null
    and d.report_date in (
      select r.report_date
      from jsonb_populate_recordset(null::public.kas_deli_lane_daily, rows) r
      where r.vung_giao is not null and r.report_date is not null
    );

  insert into public.kas_deli_lane_daily as t (report_date, lane, vung_giao, client_name, hub_type, mau_deli, ontime_deli_1st, ontime_deli_odr)
  select r.report_date, r.lane, r.vung_giao, r.client_name, r.hub_type, r.mau_deli, r.ontime_deli_1st, r.ontime_deli_odr
  from jsonb_populate_recordset(null::public.kas_deli_lane_daily, rows) r
  where r.report_date is not null and r.lane is not null and r.vung_giao is not null and r.client_name is not null
  on conflict (report_date, lane, vung_giao, client_name, hub_type) do update
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
