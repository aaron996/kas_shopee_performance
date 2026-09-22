-- COD SMS snapshot contract.
--
-- The legacy source RPC accepts one payload row as one order. The current
-- `goi_dau_COD` source is one row per SMS, so it must use the new atomic RPC
-- below with 1-order-grain `orders` plus child `sms_messages`.

-- Keep the source-order snapshot complete enough for audit without storing raw
-- SMS beside fields every signed-in dashboard user can read.
alter table public.kas_cod_suspicion_data
  add column if not exists driver_status text,
  add column if not exists driver_resignation_date date,
  add column if not exists last_call_log_date text,
  add column if not exists answered_call_count integer,
  add column if not exists consecutive_attempt_gap_days numeric,
  add column if not exists signal_call_duplicate boolean not null default false,
  add column if not exists signal_fail_reason_clustered boolean not null default false,
  add column if not exists avg_call_duration_seconds numeric,
  add column if not exists avg_ring_duration_seconds numeric,
  add column if not exists call_log_count integer,
  add column if not exists driver_order_rank integer,
  add column if not exists driver_qualifies boolean not null default false,
  add column if not exists call_verification_priority text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.kas_cod_suspicion_data'::regclass
      and conname = 'kas_cod_suspicion_data_order_snapshot_unique'
  ) then
    alter table public.kas_cod_suspicion_data
      add constraint kas_cod_suspicion_data_order_snapshot_unique
      unique (suspicion_type, driver_id, order_code);
  end if;
end
$$;

create table if not exists public.kas_cod_suspicion_sms_messages (
  id bigint generated always as identity primary key,
  suspicion_type text not null check (suspicion_type in ('Gối đầu COD', 'Rút ruột')),
  driver_id text not null,
  order_code text not null,
  sms_time timestamp without time zone not null,
  recipient_type text not null default '',
  content text not null check (char_length(btrim(content)) > 0),
  synced_at timestamptz not null default now(),
  constraint kas_cod_suspicion_sms_messages_unique
    unique (suspicion_type, driver_id, order_code, sms_time, recipient_type, content)
);

create index if not exists idx_kas_cod_suspicion_sms_messages_order
  on public.kas_cod_suspicion_sms_messages (suspicion_type, driver_id, order_code, sms_time);

alter table public.kas_cod_suspicion_sms_messages enable row level security;
revoke all on table public.kas_cod_suspicion_sms_messages from public, anon, authenticated;

alter table public.kas_cod_suspicion_metadata
  add column if not exists total_sms_messages integer not null default 0,
  add column if not exists source_rows integer not null default 0;

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
    order_code, order_status, cod_amount, warehouse_name, first_delivered_date,
    end_delivery_date, return_date, delivery_duration_days, reschedule_days_count,
    last_call_log_date, answered_call_count, first_fail_note, total_score,
    signal_count_over_p90, signal_no_listener, signal_missing_sop_reason,
    signal_reason_conflict, consecutive_attempt_gap_days, signal_reschedule_gap_over_2d,
    signal_fake_call, success_distance_km, signal_gps_far, signal_gps_duplicate,
    signal_gps_mocked, signal_call_duplicate, signal_fail_reason_clustered,
    avg_call_duration_seconds, avg_ring_duration_seconds, call_log_count,
    driver_suspicious_order_count, driver_order_rank, driver_qualifies,
    call_verification_priority, synced_at
  )
  select
    row_data.suspicion_type, row_data.driver_id, row_data.driver_name,
    row_data.driver_status, row_data.driver_resignation_date,
    row_data.order_code, row_data.order_status, row_data.cod_amount,
    row_data.warehouse_name, row_data.first_delivered_date,
    row_data.end_delivery_date, row_data.return_date,
    row_data.delivery_duration_days, row_data.reschedule_days_count,
    row_data.last_call_log_date, row_data.answered_call_count,
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
    row_data.call_verification_priority, v_sync_time
  from jsonb_to_recordset(orders) as row_data(
    suspicion_type text, driver_id text, driver_name text, driver_status text,
    driver_resignation_date date, order_code text, order_status text,
    cod_amount numeric, warehouse_name text, first_delivered_date date,
    end_delivery_date date, return_date date, delivery_duration_days numeric,
    reschedule_days_count integer, last_call_log_date text, answered_call_count integer,
    first_fail_note text, total_score integer, signal_count_over_p90 boolean,
    signal_no_listener boolean, signal_missing_sop_reason boolean,
    signal_reason_conflict boolean, consecutive_attempt_gap_days numeric,
    signal_reschedule_gap_over_2d boolean, signal_fake_call boolean,
    success_distance_km numeric, signal_gps_far boolean, signal_gps_duplicate boolean,
    signal_gps_mocked boolean, signal_call_duplicate boolean,
    signal_fail_reason_clustered boolean, avg_call_duration_seconds numeric,
    avg_ring_duration_seconds numeric, call_log_count integer,
    driver_suspicious_order_count integer, driver_order_rank integer,
    driver_qualifies boolean, call_verification_priority text
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
