-- Idempotent forward migration for AI chat suggestion refresh quota
-- Bounded to 10 refresh events per user per ICT calendar day (Asia/Ho_Chi_Minh)

create table if not exists public.ai_chat_suggestion_quota_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  quota_date date not null,
  refresh_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, quota_date)
);

alter table public.ai_chat_suggestion_quota_daily enable row level security;

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
begin
  insert into public.ai_chat_suggestion_quota_daily (user_id, quota_date, refresh_count)
  values (p_user_id, v_day, 1)
  on conflict (user_id, quota_date)
  do update set
    refresh_count = case
      when public.ai_chat_suggestion_quota_daily.refresh_count < p_limit
      then public.ai_chat_suggestion_quota_daily.refresh_count + 1
      else public.ai_chat_suggestion_quota_daily.refresh_count
    end,
    updated_at = now()
  returning refresh_count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'remaining', greatest(0, p_limit - v_count),
    'date', v_day
  );
end;
$$;

revoke all on function public.consume_ai_chat_suggestion_quota from public, anon;
grant execute on function public.consume_ai_chat_suggestion_quota to service_role, authenticated;
