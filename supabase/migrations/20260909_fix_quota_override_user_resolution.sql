-- Migration: Fix Quota Override and Reset to resolve user UUID by email if p_user_id is null

-- 1. admin_set_user_quota_override
create or replace function public.admin_set_user_quota_override(
  p_user_id uuid default null,
  p_user_email text default null,
  p_daily_turn_limit integer default null,
  p_is_unlimited boolean default false,
  p_reason text default null,
  p_changed_by text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.ai_chat_user_quota%rowtype;
  v_changed_by text := lower(trim(coalesce(p_changed_by, '')));
  v_audit_actor text;
  v_target_user_id uuid := p_user_id;
  v_target_email text := lower(trim(coalesce(p_user_email, '')));
  v_is_admin boolean := (
    current_user in ('postgres', 'supabase_admin')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'vinhlt@ghn.vn'
  );
begin
  if not v_is_admin or (v_changed_by <> '' and v_changed_by <> 'vinhlt@ghn.vn') then
    raise exception 'AI_CHAT_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'AI_CHAT_REASON_REQUIRED' using errcode = '22023';
  end if;

  if not p_is_unlimited and (p_daily_turn_limit is null or p_daily_turn_limit < 0) then
    raise exception 'AI_CHAT_INVALID_LIMIT' using errcode = '22023';
  end if;

  if v_target_email = '' and v_target_user_id is null then
    raise exception 'AI_CHAT_USER_OR_EMAIL_REQUIRED' using errcode = '22023';
  end if;

  -- Resolve user UUID from auth.users if not provided
  if v_target_user_id is null then
    select id into v_target_user_id
    from auth.users
    where lower(email) = v_target_email
    limit 1;

    -- Fallback: check ai_chat_requests
    if v_target_user_id is null then
      select user_id into v_target_user_id
      from public.ai_chat_requests
      where lower(user_email) = v_target_email
      limit 1;
    end if;

    if v_target_user_id is null then
      raise exception 'AI_CHAT_USER_NOT_FOUND' using message = 'Không tìm thấy tài khoản người dùng với email ' || v_target_email, errcode = 'P0002';
    end if;
  end if;

  -- If email was not provided, look up from auth.users
  if v_target_email = '' then
    select lower(email) into v_target_email
    from auth.users
    where id = v_target_user_id
    limit 1;
  end if;

  v_audit_actor := coalesce(nullif(v_changed_by, ''), 'service_role');

  select * into v_old from public.ai_chat_user_quota where user_id = v_target_user_id;

  insert into public.ai_chat_user_quota (
    user_id, user_email, daily_turn_limit, is_unlimited, updated_by, reason, updated_at
  ) values (
    v_target_user_id, v_target_email, case when p_is_unlimited then null else p_daily_turn_limit end,
    p_is_unlimited, v_audit_actor, trim(p_reason), now()
  ) on conflict (user_id) do update set
    user_email = excluded.user_email,
    daily_turn_limit = excluded.daily_turn_limit,
    is_unlimited = excluded.is_unlimited,
    updated_by = excluded.updated_by,
    reason = excluded.reason,
    updated_at = now();

  insert into public.ai_chat_quota_audit (
    user_id, user_email, previous_limit, previous_is_unlimited,
    new_limit, new_is_unlimited, action, changed_by, reason
  ) values (
    v_target_user_id, v_target_email, v_old.daily_turn_limit, coalesce(v_old.is_unlimited, false),
    case when p_is_unlimited then null else p_daily_turn_limit end, p_is_unlimited,
    'set_override', v_audit_actor, trim(p_reason)
  );

  return jsonb_build_object(
    'success', true,
    'userId', v_target_user_id,
    'userEmail', v_target_email,
    'isUnlimited', p_is_unlimited,
    'limit', case when p_is_unlimited then null else p_daily_turn_limit end
  );
end;
$$;

-- 2. admin_reset_user_quota
drop function if exists public.admin_reset_user_quota(uuid, text, text);

create or replace function public.admin_reset_user_quota(
  p_user_id uuid default null,
  p_reason text default null,
  p_changed_by text default null,
  p_user_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.ai_chat_user_quota%rowtype;
  v_changed_by text := lower(trim(coalesce(p_changed_by, '')));
  v_audit_actor text;
  v_target_user_id uuid := p_user_id;
  v_is_admin boolean := (
    current_user in ('postgres', 'supabase_admin')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'vinhlt@ghn.vn'
  );
begin
  if not v_is_admin or (v_changed_by <> '' and v_changed_by <> 'vinhlt@ghn.vn') then
    raise exception 'AI_CHAT_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'AI_CHAT_REASON_REQUIRED' using errcode = '22023';
  end if;

  -- Resolve user UUID if null
  if v_target_user_id is null and v_target_email <> '' then
    select user_id into v_target_user_id
    from public.ai_chat_user_quota
    where lower(user_email) = v_target_email
    limit 1;

    if v_target_user_id is null then
      select id into v_target_user_id
      from auth.users
      where lower(email) = v_target_email
      limit 1;
    end if;
  end if;

  if v_target_user_id is null then
    raise exception 'AI_CHAT_USER_NOT_FOUND' using message = 'Không tìm thấy thông tin quota của user để đặt lại mặc định', errcode = 'P0002';
  end if;

  v_audit_actor := coalesce(nullif(v_changed_by, ''), 'service_role');

  select * into v_old from public.ai_chat_user_quota where user_id = v_target_user_id;
  if not found then
    return jsonb_build_object('success', true, 'message', 'User already on default quota');
  end if;

  delete from public.ai_chat_user_quota where user_id = v_target_user_id;

  insert into public.ai_chat_quota_audit (
    user_id, user_email, previous_limit, previous_is_unlimited,
    new_limit, new_is_unlimited, action, changed_by, reason
  ) values (
    v_target_user_id, v_old.user_email, v_old.daily_turn_limit, v_old.is_unlimited,
    10, false, 'reset_default', v_audit_actor, trim(p_reason)
  );

  return jsonb_build_object('success', true, 'userId', v_target_user_id, 'defaultLimit', 10);
end;
$$;

revoke all on function public.admin_set_user_quota_override from public, anon;
revoke all on function public.admin_reset_user_quota from public, anon;
grant execute on function public.admin_set_user_quota_override to authenticated, service_role;
grant execute on function public.admin_reset_user_quota to authenticated, service_role;
