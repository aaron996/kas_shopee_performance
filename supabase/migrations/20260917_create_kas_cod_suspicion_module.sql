-- Migration: Create KAS-221 COD Suspicion Module (Đơn nghi vấn COD)
-- Tables:
--   1. public.kas_cod_suspicion_data (Grain: 1 row / order, contains all orders of qualified drivers)
--   2. public.kas_cod_suspicion_metadata (Snapshot metadata for freshness tracking even with 0 rows)
-- RPCs:
--   1. public.sync_kas_cod_suspicion_data(payload jsonb, snapshot_meta jsonb) - atomic full refresh TRUNCATE+INSERT

-- =====================================================================
-- 1. Table: kas_cod_suspicion_data
-- =====================================================================
create table if not exists public.kas_cod_suspicion_data (
  id bigint generated always as identity primary key,
  driver_id text not null,
  driver_name text,
  suspicion_type text not null check (suspicion_type in ('Gối đầu COD', 'Rút ruột')),
  order_code text not null,
  order_status text not null,
  cod_amount numeric,
  warehouse_name text,
  first_delivered_date date,
  end_delivery_date date,
  return_date date,
  delivery_duration_days numeric,
  reschedule_days_count integer,
  first_fail_note text,
  total_score integer not null default 0,
  -- 5 strong signals from KAS-221 DOCX
  signal_reason_conflict boolean not null default false,   -- M7: Lý do thất bại không khớp thực tế (+3đ)
  signal_fake_call boolean not null default false,         -- M9: Cuộc gọi có dấu hiệu giả (+2đ)
  signal_gps_far boolean not null default false,           -- M10: Vị trí giao thực tế lệch xa địa chỉ khách (+5đ)
  signal_gps_duplicate boolean not null default false,     -- M11: Trùng vị trí bất thường giữa nhiều đơn (+5đ)
  signal_gps_mocked boolean not null default false,        -- M12: Thiết bị tự báo vị trí giả (+3đ)
  -- Secondary signals & metadata
  signal_count_over_p90 boolean not null default false,    -- M1: Gọi nhiều bất thường (+2đ)
  signal_no_listener boolean not null default false,       -- M4: Gọi mà không kết nối được lần nào (+1đ)
  signal_reschedule_gap_over_2d boolean not null default false, -- M8: Hẹn giao lại nhưng trễ hẹn (+1đ)
  signal_missing_sop_reason boolean not null default false,     -- M14: Thiếu dữ liệu lý do fail (+1đ)
  driver_suspicious_order_count integer,                   -- M13: Số đơn nghi vấn của tài xế
  success_distance_km numeric,                             -- GPS distance lúc thành công
  synced_at timestamptz not null default now()
);

create index if not exists idx_kas_cod_suspicion_driver_id on public.kas_cod_suspicion_data(driver_id);
create index if not exists idx_kas_cod_suspicion_type on public.kas_cod_suspicion_data(suspicion_type);
create index if not exists idx_kas_cod_suspicion_warehouse on public.kas_cod_suspicion_data(warehouse_name);
create index if not exists idx_kas_cod_suspicion_total_score on public.kas_cod_suspicion_data(total_score desc);
create index if not exists idx_kas_cod_suspicion_order_code on public.kas_cod_suspicion_data(order_code);

alter table public.kas_cod_suspicion_data enable row level security;

-- =====================================================================
-- 2. Table: kas_cod_suspicion_metadata
-- =====================================================================
create table if not exists public.kas_cod_suspicion_metadata (
  id bigint generated always as identity primary key,
  synced_at timestamptz not null default now(),
  batch_id text,
  total_drivers integer not null default 0,
  total_orders integer not null default 0,
  notes text
);

alter table public.kas_cod_suspicion_metadata enable row level security;

-- Drop legacy policies
do $$
declare pol record;
begin
  for pol in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('kas_cod_suspicion_data', 'kas_cod_suspicion_metadata') loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- RLS: every signed-in app user can read; writes remain server-side only.
create policy "authenticated_can_read_kas_cod_suspicion_data"
  on public.kas_cod_suspicion_data
  for select
  to authenticated
  using (true);

create policy "authenticated_can_read_kas_cod_suspicion_metadata"
  on public.kas_cod_suspicion_metadata
  for select
  to authenticated
  using (true);

revoke all on table public.kas_cod_suspicion_data from anon, authenticated;
revoke all on table public.kas_cod_suspicion_metadata from anon, authenticated;
grant select on table public.kas_cod_suspicion_data to authenticated;
grant select on table public.kas_cod_suspicion_metadata to authenticated;

-- =====================================================================
-- 3. RPC: sync_kas_cod_suspicion_data (Atomic full refresh TRUNCATE+INSERT)
-- =====================================================================
create or replace function public.sync_kas_cod_suspicion_data(
  payload jsonb,
  snapshot_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(auth.jwt() ->> 'role', '');
  v_total_orders integer := 0;
  v_total_drivers integer := 0;
  v_batch_id text := coalesce(snapshot_meta ->> 'batch_id', to_char(now(), 'YYYYMMDDHH24MISS'));
  v_sync_time timestamptz := now();
begin
  -- Caller must be service_role (fail closed)
  if v_caller_role <> 'service_role' then
    raise exception 'KAS_SYNC_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  -- A malformed body must never turn a valid snapshot into an empty one.
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'KAS_SYNC_PAYLOAD_ARRAY_REQUIRED' using errcode = '22023';
  end if;

  -- Validate every row before the destructive part of the refresh. Required
  -- business fields must never be silently dropped or replaced with defaults.
  if exists (
    select 1
    from jsonb_array_elements(payload) as r
    where coalesce(nullif(trim(r ->> 'driver_id'), ''), nullif(trim(r ->> 'ID tài xế'), '')) is null
       or coalesce(nullif(trim(r ->> 'order_code'), ''), nullif(trim(r ->> 'Mã đơn'), '')) is null
       or coalesce(nullif(trim(r ->> 'suspicion_type'), ''), nullif(trim(r ->> 'Loại nghi ngờ'), '')) is null
       or coalesce(nullif(trim(r ->> 'order_status'), ''), nullif(trim(r ->> 'Trạng thái hiện tại'), '')) is null
  ) then
    raise exception 'KAS_SYNC_REQUIRED_FIELDS_MISSING' using errcode = '22023';
  end if;

  -- Atomic TRUNCATE inside transaction
  truncate table public.kas_cod_suspicion_data;

  -- Insert rows if payload is not empty
  if jsonb_array_length(payload) > 0 then
    insert into public.kas_cod_suspicion_data (
      driver_id,
      driver_name,
      suspicion_type,
      order_code,
      order_status,
      cod_amount,
      warehouse_name,
      first_delivered_date,
      end_delivery_date,
      return_date,
      delivery_duration_days,
      reschedule_days_count,
      first_fail_note,
      total_score,
      signal_reason_conflict,
      signal_fake_call,
      signal_gps_far,
      signal_gps_duplicate,
      signal_gps_mocked,
      signal_count_over_p90,
      signal_no_listener,
      signal_reschedule_gap_over_2d,
      signal_missing_sop_reason,
      driver_suspicious_order_count,
      success_distance_km,
      synced_at
    )
    select
      coalesce(nullif(trim(r ->> 'driver_id'), ''), nullif(trim(r ->> 'ID tài xế'), '')),
      nullif(trim(coalesce(r ->> 'driver_name', r ->> 'Tên tài xế')), ''),
      coalesce(nullif(trim(r ->> 'suspicion_type'), ''), nullif(trim(r ->> 'Loại nghi ngờ'), '')),
      coalesce(nullif(trim(r ->> 'order_code'), ''), nullif(trim(r ->> 'Mã đơn'), '')),
      coalesce(nullif(trim(r ->> 'order_status'), ''), nullif(trim(r ->> 'Trạng thái hiện tại'), '')),
      nullif(r ->> 'cod_amount', '')::numeric,
      nullif(trim(coalesce(r ->> 'warehouse_name', r ->> 'Kho giao')), ''),
      nullif(r ->> 'first_delivered_date', '')::date,
      nullif(r ->> 'end_delivery_date', '')::date,
      nullif(r ->> 'return_date', '')::date,
      nullif(r ->> 'delivery_duration_days', '')::numeric,
      nullif(r ->> 'reschedule_days_count', '')::integer,
      nullif(trim(coalesce(r ->> 'first_fail_note', r ->> 'Lý do fail ca giao đầu tiên')), ''),
      coalesce(nullif(r ->> 'total_score', '')::integer, nullif(r ->> 'Điểm tổng nghi vấn', '')::integer, 0),
      coalesce((r ->> 'signal_reason_conflict')::boolean, (r ->> 'Mâu thuẫn lý do vs duration (M7)')::boolean, false),
      coalesce((r ->> 'signal_fake_call')::boolean, (r ->> 'Call log giả từ lần thử 2 (M9)')::boolean, false),
      coalesce((r ->> 'signal_gps_far')::boolean, (r ->> 'GPS bất thường lúc thành công (M10)')::boolean, false),
      coalesce((r ->> 'signal_gps_duplicate')::boolean, (r ->> 'GPS trùng khớp giữa nhiều đơn (M11)')::boolean, false),
      coalesce((r ->> 'signal_gps_mocked')::boolean, (r ->> 'GPS mocked lúc thành công (M12)')::boolean, false),
      coalesce((r ->> 'signal_count_over_p90')::boolean, false),
      coalesce((r ->> 'signal_no_listener')::boolean, false),
      coalesce((r ->> 'signal_reschedule_gap_over_2d')::boolean, (r ->> 'Hẹn lại nhưng cách >=2 ngày (M8)')::boolean, false),
      coalesce((r ->> 'signal_missing_sop_reason')::boolean, (r ->> 'Thiếu dữ liệu order_fail_reason (M14)')::boolean, false),
      nullif(coalesce(r ->> 'driver_suspicious_order_count', r ->> 'so_don_nghi_van_cua_tai_xe'), '')::integer,
      nullif(coalesce(r ->> 'success_distance_km', r ->> 'Khoảng cách GPS lúc thành công (km)'), '')::numeric,
      v_sync_time
    from jsonb_array_elements(payload) as r;

    select count(*), count(distinct driver_id)
    into v_total_orders, v_total_drivers
    from public.kas_cod_suspicion_data;
  end if;

  -- Update metadata snapshot
  truncate table public.kas_cod_suspicion_metadata;
  insert into public.kas_cod_suspicion_metadata (
    synced_at, batch_id, total_drivers, total_orders, notes
  ) values (
    v_sync_time, v_batch_id, v_total_drivers, v_total_orders,
    coalesce(snapshot_meta ->> 'notes', 'Đồng bộ KAS-221 thành công')
  );

  return jsonb_build_object(
    'success', true,
    'synced_at', v_sync_time,
    'batch_id', v_batch_id,
    'total_drivers', v_total_drivers,
    'total_orders', v_total_orders
  );
end;
$$;

revoke execute on function public.sync_kas_cod_suspicion_data(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kas_cod_suspicion_data(jsonb, jsonb) to service_role;
