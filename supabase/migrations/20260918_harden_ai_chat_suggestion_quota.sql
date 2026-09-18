-- Forward hardening migration for AI chat suggestion quota
-- 1. Enforces strict server-side quota limit of 10 (overrides/ignores client limit parameter)
-- 2. Corrects boundary condition: turns 1-10 return allowed = true; turn 11+ returns allowed = false
-- 3. Revokes EXECUTE from anon, authenticated, and public; grants EXECUTE exclusively to service_role

create or replace function public.consume_ai_chat_suggestion_quota(
  p_user_id uuid,
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_count integer;
  v_limit constant integer := 10;
  v_allowed boolean;
begin
  -- Enforce server-side constant limit of 10; ignore client-provided parameter
  insert into public.ai_chat_suggestion_quota_daily (user_id, quota_date, refresh_count)
  values (p_user_id, v_day, 1)
  on conflict (user_id, quota_date)
  do update set
    refresh_count = case
      when public.ai_chat_suggestion_quota_daily.refresh_count <= v_limit
      then public.ai_chat_suggestion_quota_daily.refresh_count + 1
      else public.ai_chat_suggestion_quota_daily.refresh_count
    end,
    updated_at = now()
  returning refresh_count into v_count;

  -- Turns 1 to 10: allowed = true. Turn 11+: allowed = false.
  v_allowed := (v_count <= v_limit);

  return jsonb_build_object(
    'allowed', v_allowed,
    'count', least(v_count, v_limit),
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_count),
    'date', v_day
  );
end;
$$;

-- Revoke execute from authenticated, anon, and public
revoke all on function public.consume_ai_chat_suggestion_quota(uuid, integer) from public, anon, authenticated;
revoke execute on function public.consume_ai_chat_suggestion_quota(uuid, integer) from public, anon, authenticated;

-- Grant execute exclusively to service_role
grant execute on function public.consume_ai_chat_suggestion_quota(uuid, integer) to service_role;
