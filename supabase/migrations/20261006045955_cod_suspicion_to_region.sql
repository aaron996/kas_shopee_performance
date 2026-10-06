-- `goi_dau_COD` (query 02e) now carries "To region" (destination vùng: HNO,
-- HCM, ...) plus the 02e priority columns. Store them per order so the COD tab
-- can filter by region and use the 02e grouping. Older payloads
-- without the field keep working: the column is nullable and missing keys
-- read as null.

alter table public.kas_cod_suspicion_data
  add column if not exists to_region text,
  add column if not exists has_call_attempt_signal boolean,
  add column if not exists has_gps_mocked_signal boolean,
  add column if not exists meets_priority_02e boolean,
  add column if not exists priority_02e_order_count integer,
  add column if not exists priority_02e_group text,
  add column if not exists priority_02e_rank integer,
  add column if not exists priority_02e_reason text;

create index if not exists idx_kas_cod_suspicion_to_region
  on public.kas_cod_suspicion_data (to_region);

create or replace function public.sync_kas_cod_suspicion_snapshot(
  orders jsonb,
  sms_messages jsonb,
  snapshot_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text := coalesce(auth.jwt() ->> 'role', '');
  v_sync_time timestamptz := now();
  v_batch_id text := coalesce(snapshot_meta ->> 'batch_id', to_char(v_sync_time, 'YYYYMMDDHH24MISS'));
  v_total_orders integer := 0;
  v_total_drivers integer := 0;
  v_total_sms_messages integer := 0;
begin
  if v_caller_role <> 'service_role' then
    raise exception 'KAS_SYNC_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if orders is null or jsonb_typeof(orders) <> 'array'
    or sms_messages is null or jsonb_typeof(sms_messages) <> 'array' then
    raise exception 'KAS_SMS_SNAPSHOT_ARRAYS_REQUIRED' using errcode = '22023';
  end if;

  -- Validate every parent before TRUNCATE. A malformed refresh must preserve
  -- the last known good snapshot.
  if exists (
    select 1
    from jsonb_array_elements(orders) as row_data
    where nullif(btrim(row_data ->> 'suspicion_type'), '') is null
       or nullif(btrim(row_data ->> 'driver_id'), '') is null
       or nullif(btrim(row_data ->> 'order_code'), '') is null
       or nullif(btrim(row_data ->> 'order_status'), '') is null
       or row_data ->> 'suspicion_type' not in ('Gối đầu COD', 'Rút ruột')
  ) then
    raise exception 'KAS_SMS_SNAPSHOT_ORDER_REQUIRED_FIELDS_MISSING' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(orders) as row_data
    group by row_data ->> 'suspicion_type', row_data ->> 'driver_id', row_data ->> 'order_code'
    having count(*) > 1
  ) then
    raise exception 'KAS_SMS_SNAPSHOT_DUPLICATE_ORDER' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(sms_messages) as sms
    where nullif(btrim(sms ->> 'suspicion_type'), '') is null
       or nullif(btrim(sms ->> 'driver_id'), '') is null
       or nullif(btrim(sms ->> 'order_code'), '') is null
       or nullif(btrim(sms ->> 'sms_time'), '') is null
       or nullif(btrim(sms ->> 'content'), '') is null
       or sms ->> 'suspicion_type' not in ('Gối đầu COD', 'Rút ruột')
       or (sms ->> 'sms_time') !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$'
  ) then
    raise exception 'KAS_SMS_SNAPSHOT_MESSAGE_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(sms_messages) as sms
    where not exists (
      select 1
      from jsonb_array_elements(orders) as parent
      where parent ->> 'suspicion_type' = sms ->> 'suspicion_type'
        and parent ->> 'driver_id' = sms ->> 'driver_id'
        and parent ->> 'order_code' = sms ->> 'order_code'
    )
  ) then
    raise exception 'KAS_SMS_SNAPSHOT_MESSAGE_PARENT_NOT_FOUND' using errcode = '22023';
  end if;

  truncate table public.kas_cod_suspicion_sms_messages;
  truncate table public.kas_cod_suspicion_data;

  insert into public.kas_cod_suspicion_data (
    suspicion_type, driver_id, driver_name, driver_status, driver_resignation_date,
    order_code, order_status, cod_amount, warehouse_id, warehouse_name, first_delivered_date,
    end_delivery_date, return_date, delivery_duration_days, reschedule_days_count,
    to_region, to_province, answered_call_count, first_fail_note, total_score,
    signal_count_over_p90, signal_no_listener, signal_missing_sop_reason,
    signal_reason_conflict, consecutive_attempt_gap_days, signal_reschedule_gap_over_2d,
    signal_fake_call, success_distance_km, signal_gps_far, signal_gps_duplicate,
    signal_gps_mocked, signal_call_duplicate, signal_fail_reason_clustered,
    avg_call_duration_seconds, avg_ring_duration_seconds, call_log_count,
    driver_suspicious_order_count, driver_order_rank, driver_qualifies,
    call_verification_priority, has_call_attempt_signal, has_gps_mocked_signal,
    meets_priority_02e, priority_02e_order_count, priority_02e_group,
    priority_02e_rank, priority_02e_reason, synced_at
  )
  select
    row_data.suspicion_type, row_data.driver_id, row_data.driver_name,
    row_data.driver_status, row_data.driver_resignation_date,
    row_data.order_code, row_data.order_status, row_data.cod_amount,
    row_data.warehouse_id, row_data.warehouse_name, row_data.first_delivered_date,
    row_data.end_delivery_date, row_data.return_date,
    row_data.delivery_duration_days, row_data.reschedule_days_count,
    row_data.to_region, row_data.to_province, row_data.answered_call_count,
    row_data.first_fail_note, coalesce(row_data.total_score, 0),
    coalesce(row_data.signal_count_over_p90, false),
    coalesce(row_data.signal_no_listener, false),
    coalesce(row_data.signal_missing_sop_reason, false),
    coalesce(row_data.signal_reason_conflict, false),
    row_data.consecutive_attempt_gap_days,
    coalesce(row_data.signal_reschedule_gap_over_2d, false),
    coalesce(row_data.signal_fake_call, false), row_data.success_distance_km,
    coalesce(row_data.signal_gps_far, false),
    coalesce(row_data.signal_gps_duplicate, false),
    coalesce(row_data.signal_gps_mocked, false),
    coalesce(row_data.signal_call_duplicate, false),
    coalesce(row_data.signal_fail_reason_clustered, false),
    row_data.avg_call_duration_seconds, row_data.avg_ring_duration_seconds,
    row_data.call_log_count, row_data.driver_suspicious_order_count,
    row_data.driver_order_rank, coalesce(row_data.driver_qualifies, false),
    row_data.call_verification_priority, row_data.has_call_attempt_signal,
    row_data.has_gps_mocked_signal, row_data.meets_priority_02e,
    row_data.priority_02e_order_count, row_data.priority_02e_group,
    row_data.priority_02e_rank, row_data.priority_02e_reason, v_sync_time
  from jsonb_to_recordset(orders) as row_data(
    suspicion_type text, driver_id text, driver_name text, driver_status text,
    driver_resignation_date date, order_code text, order_status text,
    cod_amount numeric, warehouse_id text, warehouse_name text, first_delivered_date date,
    end_delivery_date date, return_date date, delivery_duration_days numeric,
    reschedule_days_count integer, to_region text, to_province text, answered_call_count integer,
    first_fail_note text, total_score integer, signal_count_over_p90 boolean,
    signal_no_listener boolean, signal_missing_sop_reason boolean,
    signal_reason_conflict boolean, consecutive_attempt_gap_days numeric,
    signal_reschedule_gap_over_2d boolean, signal_fake_call boolean,
    success_distance_km numeric, signal_gps_far boolean, signal_gps_duplicate boolean,
    signal_gps_mocked boolean, signal_call_duplicate boolean,
    signal_fail_reason_clustered boolean, avg_call_duration_seconds numeric,
    avg_ring_duration_seconds numeric, call_log_count integer,
    driver_suspicious_order_count integer, driver_order_rank integer,
    driver_qualifies boolean, call_verification_priority text,
    has_call_attempt_signal boolean, has_gps_mocked_signal boolean,
    meets_priority_02e boolean, priority_02e_order_count integer,
    priority_02e_group text, priority_02e_rank integer, priority_02e_reason text
  );

  insert into public.kas_cod_suspicion_sms_messages (
    suspicion_type, driver_id, order_code, sms_time, recipient_type, content, synced_at
  )
  select
    sms.suspicion_type, sms.driver_id, sms.order_code, sms.sms_time,
    coalesce(sms.recipient_type, ''), sms.content, v_sync_time
  from jsonb_to_recordset(sms_messages) as sms(
    suspicion_type text, driver_id text, order_code text,
    sms_time timestamp without time zone, recipient_type text, content text
  );

  select count(*), count(distinct driver_id)
  into v_total_orders, v_total_drivers
  from public.kas_cod_suspicion_data;

  select count(*) into v_total_sms_messages
  from public.kas_cod_suspicion_sms_messages;

  truncate table public.kas_cod_suspicion_metadata;
  insert into public.kas_cod_suspicion_metadata (
    synced_at, batch_id, total_drivers, total_orders, total_sms_messages, source_rows, notes
  ) values (
    v_sync_time, v_batch_id, v_total_drivers, v_total_orders,
    v_total_sms_messages, coalesce((snapshot_meta ->> 'source_rows')::integer, v_total_orders),
    coalesce(snapshot_meta ->> 'notes', 'Đồng bộ KAS-221 COD + SMS thành công')
  );

  return jsonb_build_object(
    'success', true,
    'synced_at', v_sync_time,
    'batch_id', v_batch_id,
    'total_drivers', v_total_drivers,
    'total_orders', v_total_orders,
    'total_sms_messages', v_total_sms_messages
  );
end;
$$;

revoke all on function public.sync_kas_cod_suspicion_snapshot(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_kas_cod_suspicion_snapshot(jsonb, jsonb, jsonb)
  to service_role;
