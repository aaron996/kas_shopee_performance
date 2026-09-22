-- Migration: generalize ai_chat_model_config / audit to be per-feature.
-- Existing rows are chatbot overrides; backfilled as feature='chat'. Adds
-- support for a second feature, 'cod_sms' (COD SMS AI scoring model
-- override), reusing the same override + audit machinery instead of a
-- separate table per feature.

-- 1. Add feature column to both tables, defaulting existing rows to 'chat'.
alter table public.ai_chat_model_config
  add column if not exists feature text not null default 'chat';

alter table public.ai_chat_model_config
  add constraint ai_chat_model_config_feature_check
  check (feature in ('chat', 'cod_sms'));

alter table public.ai_chat_model_config_audit
  add column if not exists feature text not null default 'chat';

alter table public.ai_chat_model_config_audit
  add constraint ai_chat_model_config_audit_feature_check
  check (feature in ('chat', 'cod_sms'));

-- 2. Widen the primary key to (feature, scope_type, scope_key) so the same
-- scope_key (e.g. 'all') can hold independent rows per feature.
alter table public.ai_chat_model_config
  drop constraint ai_chat_model_config_pk;

alter table public.ai_chat_model_config
  add constraint ai_chat_model_config_pk primary key (feature, scope_type, scope_key);

-- 3. Indexes
create index if not exists idx_ai_chat_model_config_audit_feature_created
  on public.ai_chat_model_config_audit (feature, created_at desc);

-- 4. RPCs: add p_feature (defaults to 'chat' for backward compatibility with
-- any existing caller that omits it).
create or replace function public.admin_set_ai_chat_model_config(
  p_scope_type text,
  p_user_id uuid default null,
  p_user_email text default null,
  p_model text default null,
  p_reasoning_effort text default null,
  p_reason text default null,
  p_changed_by text default null,
  p_feature text default 'chat'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feature text := lower(trim(coalesce(p_feature, 'chat')));
  v_scope_type text := lower(trim(coalesce(p_scope_type, '')));
  v_scope_key text;
  v_target_user_id uuid := p_user_id;
  v_target_email text := lower(trim(coalesce(p_user_email, '')));
  v_model text := trim(coalesce(p_model, ''));
  v_reasoning text := nullif(trim(coalesce(p_reasoning_effort, '')), '');
  v_reason text := trim(coalesce(p_reason, ''));
  v_changed_by text := lower(trim(coalesce(p_changed_by, '')));
  v_audit_actor text;
  v_old public.ai_chat_model_config%rowtype;
  v_caller_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    auth.role()
  );
  v_caller_email text := lower(trim(coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''),
    auth.jwt() ->> 'email',
    ''
  )));
  v_is_admin boolean := (
    v_caller_role = 'service_role'
    or v_caller_email = 'vinhlt@ghn.vn'
  );
begin
  if not v_is_admin or (v_changed_by <> '' and v_changed_by <> 'vinhlt@ghn.vn') then
    raise exception 'AI_CHAT_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if v_feature not in ('chat', 'cod_sms') then
    raise exception 'AI_CHAT_INVALID_FEATURE' using message = 'Tính năng cấu hình không hợp lệ.', errcode = '22023';
  end if;

  if v_reason = '' then
    raise exception 'AI_CHAT_REASON_REQUIRED' using message = 'Lý do thay đổi cấu hình là bắt buộc.', errcode = '22023';
  end if;

  if v_model = '' then
    raise exception 'AI_CHAT_MODEL_REQUIRED' using message = 'Model không được để trống.', errcode = '22023';
  end if;

  if v_scope_type not in ('all', 'user') then
    raise exception 'AI_CHAT_INVALID_SCOPE' using message = 'Phạm vi cấu hình phải là "all" hoặc "user".', errcode = '22023';
  end if;

  if v_scope_type = 'all' then
    v_scope_key := 'all';
    v_target_user_id := null;
    v_target_email := null;
  else
    -- Resolve user
    if v_target_user_id is null and v_target_email <> '' then
      select id, lower(email) into v_target_user_id, v_target_email
      from auth.users
      where lower(email) = v_target_email
      limit 1;
    elsif v_target_user_id is not null then
      select lower(email) into v_target_email
      from auth.users
      where id = v_target_user_id
      limit 1;
    end if;

    if v_target_user_id is null or v_target_email is null or v_target_email = '' then
      raise exception 'AI_CHAT_USER_NOT_FOUND' using message = 'Không tìm thấy tài khoản người dùng hợp lệ.', errcode = 'P0002';
    end if;

    v_scope_key := v_target_user_id::text;
  end if;

  v_audit_actor := coalesce(nullif(v_changed_by, ''), 'service_role');

  -- Fetch previous config if exists
  select * into v_old
  from public.ai_chat_model_config
  where feature = v_feature and scope_type = v_scope_type and scope_key = v_scope_key;

  -- Upsert configuration
  insert into public.ai_chat_model_config (
    feature, scope_type, scope_key, user_id, user_email, model, reasoning_effort, updated_by, reason, updated_at
  ) values (
    v_feature, v_scope_type, v_scope_key, v_target_user_id, v_target_email, v_model, v_reasoning, v_audit_actor, v_reason, now()
  ) on conflict (feature, scope_type, scope_key) do update set
    model = excluded.model,
    reasoning_effort = excluded.reasoning_effort,
    updated_by = excluded.updated_by,
    reason = excluded.reason,
    updated_at = now();

  -- Insert audit trail
  insert into public.ai_chat_model_config_audit (
    feature, scope_type, scope_key, user_id, user_email,
    previous_model, previous_reasoning_effort,
    new_model, new_reasoning_effort,
    action, changed_by, reason
  ) values (
    v_feature, v_scope_type, v_scope_key, v_target_user_id, v_target_email,
    v_old.model, v_old.reasoning_effort,
    v_model, v_reasoning,
    'set', v_audit_actor, v_reason
  );

  return jsonb_build_object(
    'success', true,
    'feature', v_feature,
    'scopeType', v_scope_type,
    'scopeKey', v_scope_key,
    'userId', v_target_user_id,
    'userEmail', v_target_email,
    'model', v_model,
    'reasoningEffort', v_reasoning
  );
end;
$$;

create or replace function public.admin_reset_ai_chat_model_config(
  p_scope_type text,
  p_user_id uuid default null,
  p_user_email text default null,
  p_reason text default null,
  p_changed_by text default null,
  p_feature text default 'chat'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feature text := lower(trim(coalesce(p_feature, 'chat')));
  v_scope_type text := lower(trim(coalesce(p_scope_type, '')));
  v_scope_key text;
  v_target_user_id uuid := p_user_id;
  v_target_email text := lower(trim(coalesce(p_user_email, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_changed_by text := lower(trim(coalesce(p_changed_by, '')));
  v_audit_actor text;
  v_old public.ai_chat_model_config%rowtype;
  v_caller_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    auth.role()
  );
  v_caller_email text := lower(trim(coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''),
    auth.jwt() ->> 'email',
    ''
  )));
  v_is_admin boolean := (
    v_caller_role = 'service_role'
    or v_caller_email = 'vinhlt@ghn.vn'
  );
begin
  if not v_is_admin or (v_changed_by <> '' and v_changed_by <> 'vinhlt@ghn.vn') then
    raise exception 'AI_CHAT_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if v_feature not in ('chat', 'cod_sms') then
    raise exception 'AI_CHAT_INVALID_FEATURE' using message = 'Tính năng cấu hình không hợp lệ.', errcode = '22023';
  end if;

  if v_reason = '' then
    raise exception 'AI_CHAT_REASON_REQUIRED' using message = 'Lý do xóa cấu hình là bắt buộc.', errcode = '22023';
  end if;

  if v_scope_type not in ('all', 'user') then
    raise exception 'AI_CHAT_INVALID_SCOPE' using message = 'Phạm vi cấu hình phải là "all" hoặc "user".', errcode = '22023';
  end if;

  if v_scope_type = 'all' then
    v_scope_key := 'all';
    v_target_user_id := null;
    v_target_email := null;
  else
    if v_target_user_id is null and v_target_email <> '' then
      select id, lower(email) into v_target_user_id, v_target_email
      from auth.users
      where lower(email) = v_target_email
      limit 1;
    elsif v_target_user_id is not null then
      select lower(email) into v_target_email
      from auth.users
      where id = v_target_user_id
      limit 1;
    end if;

    if v_target_user_id is null then
      if v_target_email <> '' then
        select user_id into v_target_user_id
        from public.ai_chat_model_config
        where feature = v_feature and scope_type = 'user' and lower(user_email) = v_target_email
        limit 1;
      end if;
    end if;

    if v_target_user_id is null then
      raise exception 'AI_CHAT_USER_NOT_FOUND' using message = 'Không tìm thấy thông tin user để đặt lại cấu hình.', errcode = 'P0002';
    end if;

    v_scope_key := v_target_user_id::text;
  end if;

  v_audit_actor := coalesce(nullif(v_changed_by, ''), 'service_role');

  select * into v_old
  from public.ai_chat_model_config
  where feature = v_feature and scope_type = v_scope_type and scope_key = v_scope_key;

  if not found then
    insert into public.ai_chat_model_config_audit (
      feature, scope_type, scope_key, user_id, user_email,
      previous_model, previous_reasoning_effort,
      new_model, new_reasoning_effort,
      action, changed_by, reason
    ) values (
      v_feature, v_scope_type, v_scope_key, v_target_user_id, coalesce(v_target_email, v_old.user_email),
      null, null, null, null,
      'reset', v_audit_actor, v_reason
    );
    return jsonb_build_object('success', true, 'message', 'Cấu hình đã ở mặc định.');
  end if;

  delete from public.ai_chat_model_config
  where feature = v_feature and scope_type = v_scope_type and scope_key = v_scope_key;

  insert into public.ai_chat_model_config_audit (
    feature, scope_type, scope_key, user_id, user_email,
    previous_model, previous_reasoning_effort,
    new_model, new_reasoning_effort,
    action, changed_by, reason
  ) values (
    v_feature, v_scope_type, v_scope_key, v_target_user_id, coalesce(v_target_email, v_old.user_email),
    v_old.model, v_old.reasoning_effort,
    null, null,
    'reset', v_audit_actor, v_reason
  );

  return jsonb_build_object('success', true, 'feature', v_feature, 'scopeType', v_scope_type, 'scopeKey', v_scope_key);
end;
$$;

-- 5. Function privileges (unchanged targets, new signatures need re-grant)
revoke execute on function public.admin_set_ai_chat_model_config(text, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_reset_ai_chat_model_config(text, uuid, text, text, text, text) from public, anon, authenticated;

grant execute on function public.admin_set_ai_chat_model_config(text, uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.admin_reset_ai_chat_model_config(text, uuid, text, text, text, text) to service_role;

-- 6. `create or replace function` with a different arg list creates a new
-- overload rather than replacing the old one — drop the pre-migration
-- 7-arg/5-arg signatures so only the p_feature-aware versions remain.
drop function if exists public.admin_set_ai_chat_model_config(text, uuid, text, text, text, text, text);
drop function if exists public.admin_reset_ai_chat_model_config(text, uuid, text, text, text);
