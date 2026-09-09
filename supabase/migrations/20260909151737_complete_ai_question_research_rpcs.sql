-- Complete the question-research pipeline after the missing columns are present.
-- These functions are server-only: the API authenticates the user and calls them with service_role.

create or replace function public.reserve_ai_chat_request(
  p_user_id uuid,
  p_org_id text,
  p_request_id uuid,
  p_payload_hash text,
  p_reserved_microusd bigint,
  p_user_turn_limit integer,
  p_org_turn_limit integer,
  p_user_budget_microusd bigint,
  p_org_budget_microusd bigint,
  p_user_email text default null,
  p_question text default null,
  p_question_normalized text default null,
  p_question_fingerprint text default null,
  p_client_filter text default null,
  p_active_tab text default null,
  p_model text default null
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
  v_override public.ai_chat_user_quota%rowtype;
  v_effective_user_turn_limit integer := p_user_turn_limit;
  v_is_unlimited boolean := false;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'AI_CHAT_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_reserved_microusd <= 0 or p_user_turn_limit <= 0 or p_org_turn_limit <= 0 then
    raise exception 'AI_CHAT_INVALID_LIMITS' using errcode = '22023';
  end if;

  select * into v_override
  from public.ai_chat_user_quota
  where user_id = p_user_id;

  if found then
    if v_override.is_unlimited then
      v_is_unlimited := true;
      v_effective_user_turn_limit := 2147483647;
    else
      v_effective_user_turn_limit := v_override.daily_turn_limit;
    end if;
  end if;

  insert into public.ai_chat_requests (
    request_id, user_id, org_id, payload_hash, status, reserved_microusd, quota_date,
    user_email, question, question_normalized, question_fingerprint,
    client_filter, active_tab, model, started_at
  ) values (
    p_request_id, p_user_id, p_org_id, p_payload_hash, 'in_flight', p_reserved_microusd, v_day,
    p_user_email, p_question, p_question_normalized, p_question_fingerprint,
    p_client_filter, p_active_tab, p_model, now()
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

  select * into v_org from public.ai_chat_quota_daily
  where scope_type = 'org' and scope_id = p_org_id and usage_date = v_day
  for update;
  select * into v_user from public.ai_chat_quota_daily
  where scope_type = 'user' and scope_id = p_user_id::text and usage_date = v_day
  for update;

  if v_org.turn_count >= p_org_turn_limit
     or (not v_is_unlimited and v_user.turn_count >= v_effective_user_turn_limit) then
    raise exception 'AI_CHAT_TURN_LIMIT' using errcode = 'P0001';
  end if;
  if v_org.used_microusd + v_org.reserved_microusd + p_reserved_microusd > p_org_budget_microusd
     or (not v_is_unlimited and v_user.used_microusd + v_user.reserved_microusd + p_reserved_microusd > p_user_budget_microusd) then
    raise exception 'AI_CHAT_BUDGET_LIMIT' using errcode = 'P0001';
  end if;

  update public.ai_chat_quota_daily
  set turn_count = turn_count + 1,
      reserved_microusd = reserved_microusd + p_reserved_microusd,
      updated_at = now()
  where usage_date = v_day
    and ((scope_type = 'org' and scope_id = p_org_id)
      or (scope_type = 'user' and scope_id = p_user_id::text));

  return jsonb_build_object(
    'requestId', p_request_id,
    'quotaDate', v_day,
    'reservedMicrousd', p_reserved_microusd,
    'usedToday', v_user.turn_count + 1,
    'dailyLimit', case when v_is_unlimited then null else v_effective_user_turn_limit end,
    'isUnlimited', v_is_unlimited,
    'remainingTurns', case when v_is_unlimited then null else greatest(0, v_effective_user_turn_limit - (v_user.turn_count + 1)) end,
    'resetAt', ((v_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
  );
end;
$$;

create or replace function public.record_ai_chat_quota_rejection(
  p_user_id uuid,
  p_org_id text,
  p_request_id uuid,
  p_payload_hash text,
  p_user_email text default null,
  p_question text default null,
  p_question_normalized text default null,
  p_question_fingerprint text default null,
  p_client_filter text default null,
  p_active_tab text default null,
  p_model text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'AI_CHAT_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  insert into public.ai_chat_requests (
    request_id, user_id, org_id, payload_hash, status, reserved_microusd, actual_microusd,
    quota_date, user_email, question, question_normalized, question_fingerprint,
    client_filter, active_tab, model, error_code, error_message, started_at, finished_at
  ) values (
    p_request_id, p_user_id, p_org_id, p_payload_hash, 'rejected_by_quota', 0, 0,
    v_day, p_user_email, p_question, p_question_normalized, p_question_fingerprint,
    p_client_filter, p_active_tab, p_model, 'CHAT_QUOTA_EXCEEDED',
    'Hôm nay bạn đã hết lượt hoặc ngân sách chatbot.', now(), now()
  ) on conflict (request_id) do nothing;

  return true;
end;
$$;

create or replace function public.purge_old_ai_chat_questions(
  p_retention_days integer default 90
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'AI_CHAT_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_retention_days < 1 then
    raise exception 'AI_CHAT_INVALID_RETENTION' using errcode = '22023';
  end if;

  update public.ai_chat_requests
  set question = '[PURGED_BY_RETENTION]',
      question_normalized = '[PURGED]'
  where started_at < now() - (p_retention_days || ' days')::interval
    and question is not null
    and question <> '[PURGED_BY_RETENTION]';

  get diagnostics v_purged = row_count;
  return v_purged;
end;
$$;

revoke all on function public.reserve_ai_chat_request(
  uuid, text, uuid, text, bigint, integer, integer, bigint, bigint,
  text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.record_ai_chat_quota_rejection(
  uuid, text, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.purge_old_ai_chat_questions(integer)
  from public, anon, authenticated;

grant execute on function public.reserve_ai_chat_request(
  uuid, text, uuid, text, bigint, integer, integer, bigint, bigint,
  text, text, text, text, text, text, text
) to service_role;
grant execute on function public.record_ai_chat_quota_rejection(
  uuid, text, uuid, text, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.purge_old_ai_chat_questions(integer)
  to service_role;
