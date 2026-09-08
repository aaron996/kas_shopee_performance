-- Server-side chatbot support: quota/usage ledger plus fixed, read-only data RPCs.
-- Apply only after reviewing the live table policies. Data RPCs are SECURITY INVOKER.

create table if not exists public.ai_chat_quota_daily (
  scope_type text not null check (scope_type in ('user', 'org')),
  scope_id text not null,
  usage_date date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  turn_count integer not null default 0 check (turn_count >= 0),
  reserved_microusd bigint not null default 0 check (reserved_microusd >= 0),
  used_microusd bigint not null default 0 check (used_microusd >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_id, usage_date)
);

create table if not exists public.ai_chat_requests (
  request_id uuid primary key,
  user_id uuid not null,
  org_id text not null,
  payload_hash text not null,
  status text not null default 'in_flight' check (status in ('in_flight', 'completed', 'failed')),
  reserved_microusd bigint not null check (reserved_microusd >= 0),
  actual_microusd bigint,
  tool_names text[] not null default '{}',
  quota_date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.ai_chat_usage (
  request_id uuid not null references public.ai_chat_requests(request_id) on delete cascade,
  round integer not null check (round > 0),
  model text not null,
  effort text not null,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  estimated_microusd bigint not null default 0,
  tool_names text[] not null default '{}',
  latency_ms integer not null default 0,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (request_id, round)
);

alter table public.ai_chat_quota_daily enable row level security;
alter table public.ai_chat_requests enable row level security;
alter table public.ai_chat_usage enable row level security;

revoke all on public.ai_chat_quota_daily from anon, authenticated;
revoke all on public.ai_chat_requests from anon, authenticated;
revoke all on public.ai_chat_usage from anon, authenticated;
grant all on public.ai_chat_quota_daily to service_role;
grant all on public.ai_chat_requests to service_role;
grant all on public.ai_chat_usage to service_role;

create or replace function public.reserve_ai_chat_request(
  p_user_id uuid,
  p_org_id text,
  p_request_id uuid,
  p_payload_hash text,
  p_reserved_microusd bigint,
  p_user_turn_limit integer,
  p_org_turn_limit integer,
  p_user_budget_microusd bigint,
  p_org_budget_microusd bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_existing public.ai_chat_requests%rowtype;
  v_org public.ai_chat_quota_daily%rowtype;
  v_user public.ai_chat_quota_daily%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'AI_CHAT_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_reserved_microusd <= 0 or p_user_turn_limit <= 0 or p_org_turn_limit <= 0 then
    raise exception 'AI_CHAT_INVALID_LIMITS' using errcode = '22023';
  end if;

  insert into public.ai_chat_requests (
    request_id, user_id, org_id, payload_hash, status, reserved_microusd, quota_date
  ) values (
    p_request_id, p_user_id, p_org_id, p_payload_hash, 'in_flight', p_reserved_microusd, v_day
  ) on conflict (request_id) do nothing;

  if not found then
    select * into v_existing
    from public.ai_chat_requests
    where request_id = p_request_id
    for update;
    if v_existing.payload_hash <> p_payload_hash or v_existing.user_id <> p_user_id then
      raise exception 'AI_CHAT_PAYLOAD_CONFLICT' using errcode = 'P0001';
    end if;
    raise exception 'AI_CHAT_DUPLICATE' using errcode = 'P0001';
  end if;

  insert into public.ai_chat_quota_daily (scope_type, scope_id, usage_date)
  values ('org', p_org_id, v_day), ('user', p_user_id::text, v_day)
  on conflict do nothing;

  -- Lock in deterministic org -> user order to avoid cross-request deadlocks.
  select * into v_org from public.ai_chat_quota_daily
  where scope_type = 'org' and scope_id = p_org_id and usage_date = v_day
  for update;
  select * into v_user from public.ai_chat_quota_daily
  where scope_type = 'user' and scope_id = p_user_id::text and usage_date = v_day
  for update;

  if v_org.turn_count >= p_org_turn_limit or v_user.turn_count >= p_user_turn_limit then
    raise exception 'AI_CHAT_TURN_LIMIT' using errcode = 'P0001';
  end if;
  if v_org.used_microusd + v_org.reserved_microusd + p_reserved_microusd > p_org_budget_microusd
     or v_user.used_microusd + v_user.reserved_microusd + p_reserved_microusd > p_user_budget_microusd then
    raise exception 'AI_CHAT_BUDGET_LIMIT' using errcode = 'P0001';
  end if;

  update public.ai_chat_quota_daily
  set turn_count = turn_count + 1,
      reserved_microusd = reserved_microusd + p_reserved_microusd,
      updated_at = now()
  where usage_date = v_day
    and ((scope_type = 'org' and scope_id = p_org_id)
      or (scope_type = 'user' and scope_id = p_user_id::text));

  return jsonb_build_object('requestId', p_request_id, 'quotaDate', v_day, 'reservedMicrousd', p_reserved_microusd);
end;
$$;

create or replace function public.finalize_ai_chat_request(
  p_request_id uuid,
  p_status text,
  p_actual_microusd bigint,
  p_usage jsonb,
  p_tool_names text[]
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ai_chat_requests%rowtype;
  v_item jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'AI_CHAT_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_status not in ('completed', 'failed') or p_actual_microusd < 0 then
    raise exception 'AI_CHAT_INVALID_FINAL_STATE' using errcode = '22023';
  end if;

  select * into v_request from public.ai_chat_requests
  where request_id = p_request_id
  for update;
  if not found then raise exception 'AI_CHAT_REQUEST_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_request.status <> 'in_flight' then return false; end if;

  update public.ai_chat_quota_daily
  set reserved_microusd = greatest(0, reserved_microusd - v_request.reserved_microusd),
      used_microusd = used_microusd + p_actual_microusd,
      updated_at = now()
  where usage_date = v_request.quota_date
    and ((scope_type = 'org' and scope_id = v_request.org_id)
      or (scope_type = 'user' and scope_id = v_request.user_id::text));

  update public.ai_chat_requests
  set status = p_status,
      actual_microusd = p_actual_microusd,
      tool_names = coalesce(p_tool_names, '{}'),
      finished_at = now()
  where request_id = p_request_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_usage, '[]'::jsonb)) loop
    insert into public.ai_chat_usage (
      request_id, round, model, effort, input_tokens, cached_input_tokens,
      output_tokens, reasoning_tokens, estimated_microusd, tool_names, latency_ms, status
    ) values (
      p_request_id,
      (v_item ->> 'round')::integer,
      coalesce(v_item ->> 'model', 'unknown'),
      coalesce(v_item ->> 'effort', 'unknown'),
      coalesce((v_item ->> 'inputTokens')::integer, 0),
      coalesce((v_item ->> 'cachedInputTokens')::integer, 0),
      coalesce((v_item ->> 'outputTokens')::integer, 0),
      coalesce((v_item ->> 'reasoningTokens')::integer, 0),
      coalesce((v_item ->> 'estimatedMicrousd')::bigint, 0),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_item -> 'toolNames', '[]'::jsonb))), '{}'),
      coalesce((v_item ->> 'latencyMs')::integer, 0),
      coalesce(v_item ->> 'status', p_status)
    ) on conflict (request_id, round) do nothing;
  end loop;

  return true;
end;
$$;

revoke all on function public.reserve_ai_chat_request(uuid, text, uuid, text, bigint, integer, integer, bigint, bigint) from public, anon, authenticated;
revoke all on function public.finalize_ai_chat_request(uuid, text, bigint, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.reserve_ai_chat_request(uuid, text, uuid, text, bigint, integer, integer, bigint, bigint) to service_role;
grant execute on function public.finalize_ai_chat_request(uuid, text, bigint, jsonb, text[]) to service_role;

create or replace function public.get_ai_chat_coverage(p_dataset text, p_client text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v_result jsonb;
begin
  if p_dataset = 'pick' then
    select jsonb_build_object(
      'dataset', p_dataset, 'client', p_client,
      'dateFrom', min(nullif(to_jsonb(t)->>'report_date', '')::date),
      'dataAsOf', max(nullif(to_jsonb(t)->>'report_date', '')::date),
      'syncedAt', max(to_jsonb(t)->>'synced_at'), 'rowCount', count(*)
    ) into v_result from public.kas_pick_data t
    where p_client = 'ALL' or upper(coalesce(to_jsonb(t)->>'client_name', '')) = p_client;
  elsif p_dataset = 'deli' then
    select jsonb_build_object(
      'dataset', p_dataset, 'client', p_client,
      'dateFrom', min(nullif(to_jsonb(t)->>'report_date', '')::date),
      'dataAsOf', max(nullif(to_jsonb(t)->>'report_date', '')::date),
      'syncedAt', max(to_jsonb(t)->>'synced_at'), 'rowCount', count(*)
    ) into v_result from public.kas_deli_data t
    where p_client = 'ALL' or upper(coalesce(to_jsonb(t)->>'client_name', '')) = p_client;
  elsif p_dataset = 'ca1' then
    select jsonb_build_object(
      'dataset', p_dataset, 'client', null,
      'dateFrom', min(nullif(to_jsonb(t)->>'ngay', '')::date),
      'dataAsOf', max(nullif(to_jsonb(t)->>'ngay', '')::date),
      'syncedAt', max(to_jsonb(t)->>'synced_at'), 'rowCount', count(*),
      'note', 'Nguồn Ca 1 không có chiều client.'
    ) into v_result from public.kas_ca1_data t;
  elsif p_dataset = 'leadtime' then
    select jsonb_build_object(
      'dataset', p_dataset, 'client', p_client,
      'dateFrom', min(nullif(to_jsonb(t)->>'report_date', '')::date),
      'dataAsOf', max(nullif(to_jsonb(t)->>'report_date', '')::date),
      'syncedAt', max(to_jsonb(t)->>'synced_at'), 'rowCount', count(*)
    ) into v_result from public.kas_leadtime_data t
    where p_client = 'ALL' or upper(coalesce(to_jsonb(t)->>'client_name', '')) = p_client;
  else
    raise exception 'AI_CHAT_DATASET_NOT_ALLOWED' using errcode = '22023';
  end if;
  return v_result;
end;
$$;

create or replace function public.get_ai_chat_metric(
  p_metric text,
  p_client text,
  p_date_from date,
  p_date_to date,
  p_grain text,
  p_regions text[],
  p_hub_types text[],
  p_limit integer,
  p_sort text
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare v_result jsonb;
begin
  if p_metric not in ('p1st', 'opr', 'd1st', 'odr')
     or p_grain not in ('nationwide', 'region', 'hub')
     or p_sort not in ('worst', 'best', 'volume_desc')
     or p_limit not between 1 and 50 then
    raise exception 'AI_CHAT_METRIC_ARGUMENT_NOT_ALLOWED' using errcode = '22023';
  end if;

  if p_metric in ('p1st', 'opr') then
    with source as (
      select
        nullif(to_jsonb(t)->>'report_date', '')::date as report_date,
        upper(coalesce(to_jsonb(t)->>'client_name', '')) as client_name,
        case when upper(coalesce(to_jsonb(t)->>'region', '')) = 'HCM'
                  and upper(coalesce(to_jsonb(t)->>'hub type', to_jsonb(t)->>'Hub Type', to_jsonb(t)->>'hub_type', to_jsonb(t)->>'Hub_Type', to_jsonb(t)->>'hubType', to_jsonb(t)->>'HubType', '')) = 'KA'
             then 'HCM - KA' else coalesce(to_jsonb(t)->>'region', 'Không rõ') end as region,
        coalesce(to_jsonb(t)->>'hub', to_jsonb(t)->>'hub_name', 'Không rõ') as hub,
        coalesce(to_jsonb(t)->>'hub type', to_jsonb(t)->>'Hub Type', to_jsonb(t)->>'hub_type', to_jsonb(t)->>'Hub_Type', to_jsonb(t)->>'hubType', to_jsonb(t)->>'HubType', 'Không rõ') as hub_type,
        nullif(regexp_replace(coalesce(to_jsonb(t)->>'mau_pu', ''), '[^0-9.-]', '', 'g'), '')::numeric as denominator,
        nullif(regexp_replace(coalesce(
          case when p_metric = 'p1st' then to_jsonb(t)->>'ontime_pu_1st' else to_jsonb(t)->>'ontime_pu_opr' end, ''
        ), '[^0-9.-]', '', 'g'), '')::numeric as numerator,
        to_jsonb(t)->>'synced_at' as synced_at
      from public.kas_pick_data t
    ), scoped as (
      select *, case p_grain when 'nationwide' then 'Toàn quốc' when 'region' then region else hub end as entity
      from source
      where report_date between p_date_from and p_date_to
        and (p_client = 'ALL' or client_name = p_client)
        and (coalesce(array_length(p_regions, 1), 0) = 0 or region = any(p_regions))
        and (coalesce(array_length(p_hub_types, 1), 0) = 0 or hub_type = any(p_hub_types))
    ), grouped as (
      select entity, sum(denominator) as volume, sum(numerator) as ontime,
        round(100 * sum(numerator) / nullif(sum(denominator), 0), 2) as value
      from scoped group by entity
    ), ranked as (
      select * from grouped
      order by
        case when p_sort = 'worst' then value end asc nulls last,
        case when p_sort = 'best' then value end desc nulls last,
        case when p_sort = 'volume_desc' then volume end desc nulls last,
        entity asc limit p_limit
    )
    select jsonb_build_object(
      'metric', p_metric,
      'scope', jsonb_build_object('client', p_client, 'dateFrom', p_date_from, 'dateTo', p_date_to, 'grain', p_grain),
      'dataAsOf', (select max(report_date) from scoped),
      'syncedAt', (select max(synced_at) from scoped),
      'rows', coalesce((select jsonb_agg(to_jsonb(ranked)) from ranked), '[]'::jsonb)
    ) into v_result;
  else
    with source as (
      select
        nullif(to_jsonb(t)->>'report_date', '')::date as report_date,
        upper(coalesce(to_jsonb(t)->>'client_name', '')) as client_name,
        case when upper(coalesce(to_jsonb(t)->>'region', '')) = 'HCM'
                  and upper(coalesce(to_jsonb(t)->>'hub type', to_jsonb(t)->>'Hub Type', to_jsonb(t)->>'hub_type', to_jsonb(t)->>'Hub_Type', to_jsonb(t)->>'hubType', to_jsonb(t)->>'HubType', '')) = 'KA'
             then 'HCM - KA' else coalesce(to_jsonb(t)->>'region', 'Không rõ') end as region,
        coalesce(to_jsonb(t)->>'hub', to_jsonb(t)->>'hub_name', 'Không rõ') as hub,
        coalesce(to_jsonb(t)->>'hub type', to_jsonb(t)->>'Hub Type', to_jsonb(t)->>'hub_type', to_jsonb(t)->>'Hub_Type', to_jsonb(t)->>'hubType', to_jsonb(t)->>'HubType', 'Không rõ') as hub_type,
        nullif(regexp_replace(coalesce(to_jsonb(t)->>'mau_deli', to_jsonb(t)->>'mau_del', ''), '[^0-9.-]', '', 'g'), '')::numeric as denominator,
        nullif(regexp_replace(coalesce(
          case when p_metric = 'd1st'
            then coalesce(to_jsonb(t)->>'ontime_deli_1st', to_jsonb(t)->>'ontime_del_1st')
            else coalesce(to_jsonb(t)->>'ontime_deli_odr', to_jsonb(t)->>'ontime_del_odr') end, ''
        ), '[^0-9.-]', '', 'g'), '')::numeric as numerator,
        to_jsonb(t)->>'synced_at' as synced_at
      from public.kas_deli_data t
    ), scoped as (
      select *, case p_grain when 'nationwide' then 'Toàn quốc' when 'region' then region else hub end as entity
      from source
      where report_date between p_date_from and p_date_to
        and (p_client = 'ALL' or client_name = p_client)
        and (coalesce(array_length(p_regions, 1), 0) = 0 or region = any(p_regions))
        and (coalesce(array_length(p_hub_types, 1), 0) = 0 or hub_type = any(p_hub_types))
    ), grouped as (
      select entity, sum(denominator) as volume, sum(numerator) as ontime,
        round(100 * sum(numerator) / nullif(sum(denominator), 0), 2) as value
      from scoped group by entity
    ), ranked as (
      select * from grouped
      order by
        case when p_sort = 'worst' then value end asc nulls last,
        case when p_sort = 'best' then value end desc nulls last,
        case when p_sort = 'volume_desc' then volume end desc nulls last,
        entity asc limit p_limit
    )
    select jsonb_build_object(
      'metric', p_metric,
      'scope', jsonb_build_object('client', p_client, 'dateFrom', p_date_from, 'dateTo', p_date_to, 'grain', p_grain),
      'dataAsOf', (select max(report_date) from scoped),
      'syncedAt', (select max(synced_at) from scoped),
      'rows', coalesce((select jsonb_agg(to_jsonb(ranked)) from ranked), '[]'::jsonb)
    ) into v_result;
  end if;
  return v_result;
end;
$$;

create or replace function public.get_ai_chat_ca1(
  p_date_from date,
  p_date_to date,
  p_lane text,
  p_regions text[],
  p_limit integer
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with source as (
    select
      nullif(to_jsonb(t)->>'ngay', '')::date as report_date,
      coalesce(to_jsonb(t)->>'lane', 'Không rõ') as lane,
      coalesce(to_jsonb(t)->>'vung_giao', 'Không rõ') as region,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'tong_don', ''), '[^0-9.-]', '', 'g'), '')::numeric as total_orders,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'don_hub_giao_ca1', ''), '[^0-9.-]', '', 'g'), '')::numeric as ca1_orders,
      to_jsonb(t)->>'synced_at' as synced_at
    from public.kas_ca1_data t
  ), scoped as (
    select * from source
    where report_date between p_date_from and p_date_to
      and (p_lane is null or lane = p_lane)
      and (coalesce(array_length(p_regions, 1), 0) = 0 or region = any(p_regions))
  ), grouped as (
    select lane, region, sum(total_orders) as total_orders, sum(ca1_orders) as ca1_orders,
      round(100 * sum(ca1_orders) / nullif(sum(total_orders), 0), 2) as value
    from scoped group by lane, region order by value asc nulls last, total_orders desc limit greatest(1, least(p_limit, 50))
  )
  select jsonb_build_object(
    'metric', 'ca1', 'note', 'Nguồn Ca 1 không có chiều client.',
    'scope', jsonb_build_object('dateFrom', p_date_from, 'dateTo', p_date_to, 'lane', p_lane),
    'dataAsOf', (select max(report_date) from scoped),
    'syncedAt', (select max(synced_at) from scoped),
    'rows', coalesce((select jsonb_agg(to_jsonb(grouped)) from grouped), '[]'::jsonb)
  );
$$;

create or replace function public.get_ai_chat_leadtime(
  p_client text,
  p_date_from date,
  p_date_to date,
  p_lane text,
  p_from_province text,
  p_to_province text,
  p_limit integer
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with source as (
    select
      nullif(to_jsonb(t)->>'report_date', '')::date as report_date,
      upper(coalesce(to_jsonb(t)->>'client_name', '')) as client_name,
      coalesce(to_jsonb(t)->>'externallane_new', 'Không rõ') as lane,
      coalesce(to_jsonb(t)->>'fromprovince_new', 'Không rõ') as from_province,
      coalesce(to_jsonb(t)->>'toprovince_new', 'Không rõ') as to_province,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'mau', ''), '[^0-9.-]', '', 'g'), '')::numeric as volume,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'avg_lt_prepickup_hour', ''), '[^0-9.-]', '', 'g'), '')::numeric as prepickup,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'avg_lt_firstmile_hour', ''), '[^0-9.-]', '', 'g'), '')::numeric as firstmile,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'avg_lt_middlemile_hour', ''), '[^0-9.-]', '', 'g'), '')::numeric as middlemile,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'avg_lt_lastmile_hour', ''), '[^0-9.-]', '', 'g'), '')::numeric as lastmile,
      nullif(regexp_replace(coalesce(to_jsonb(t)->>'avg_lt_e2e_hour', ''), '[^0-9.-]', '', 'g'), '')::numeric as e2e,
      to_jsonb(t)->>'synced_at' as synced_at
    from public.kas_leadtime_data t
  ), scoped as (
    select * from source
    where report_date between p_date_from and p_date_to
      and (p_client = 'ALL' or client_name = p_client)
      and (p_lane is null or lane = p_lane)
      and (p_from_province is null or from_province = p_from_province)
      and (p_to_province is null or to_province = p_to_province)
  ), grouped as (
    select lane, from_province, to_province, sum(volume) as volume,
      round(sum(prepickup * volume) / nullif(sum(volume) filter (where prepickup is not null), 0), 2) as prepickup_hours,
      round(sum(firstmile * volume) / nullif(sum(volume) filter (where firstmile is not null), 0), 2) as firstmile_hours,
      round(sum(middlemile * volume) / nullif(sum(volume) filter (where middlemile is not null), 0), 2) as middlemile_hours,
      round(sum(lastmile * volume) / nullif(sum(volume) filter (where lastmile is not null), 0), 2) as lastmile_hours,
      round(sum(e2e * volume) / nullif(sum(volume) filter (where e2e is not null), 0), 2) as e2e_hours
    from scoped group by lane, from_province, to_province
    order by e2e_hours desc nulls last, volume desc limit greatest(1, least(p_limit, 50))
  )
  select jsonb_build_object(
    'metric', 'leadtime',
    'scope', jsonb_build_object('client', p_client, 'dateFrom', p_date_from, 'dateTo', p_date_to, 'lane', p_lane,
      'fromProvince', p_from_province, 'toProvince', p_to_province),
    'dataAsOf', (select max(report_date) from scoped),
    'syncedAt', (select max(synced_at) from scoped),
    'rows', coalesce((select jsonb_agg(to_jsonb(grouped)) from grouped), '[]'::jsonb)
  );
$$;

revoke all on function public.get_ai_chat_coverage(text, text) from public, anon;
revoke all on function public.get_ai_chat_metric(text, text, date, date, text, text[], text[], integer, text) from public, anon;
revoke all on function public.get_ai_chat_ca1(date, date, text, text[], integer) from public, anon;
revoke all on function public.get_ai_chat_leadtime(text, date, date, text, text, text, integer) from public, anon;
grant execute on function public.get_ai_chat_coverage(text, text) to authenticated;
grant execute on function public.get_ai_chat_metric(text, text, date, date, text, text[], text[], integer, text) to authenticated;
grant execute on function public.get_ai_chat_ca1(date, date, text, text[], integer) to authenticated;
grant execute on function public.get_ai_chat_leadtime(text, date, date, text, text, text, integer) to authenticated;
