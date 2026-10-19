-- Extend the app-owned, non-partitioned telemetry table with bounded read-only
-- exploration. The previous reader stays available for older deployments.
create function public.dev_app_usage_monitor(
  p_from date, p_to date, p_email text default '',
  p_tab text default '', p_day date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_first timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'USAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to > v_today
    or p_to - p_from > 89
    or (p_day is not null and (p_day < p_from or p_day > p_to)) then
    raise exception 'USAGE_RANGE_INVALID' using errcode = '22023';
  end if;
  if p_tab is null or (p_tab <> '' and p_tab not in
    ('home','report1','ranking','report5','report3','report-insight','cod-suspicion','dev-admin')) then
    raise exception 'USAGE_TAB_INVALID' using errcode = '22023';
  end if;
  select min(started_at) into v_first from public.app_usage;
  with period as materialized (
    select user_id,email,session_id,day,tab_id,started_at,last_seen_at,active_ms,views,chat_questions,exports
    from public.app_usage where day between p_from and p_to
  ), context as materialized (
    select * from period
    where (coalesce(p_email,'') = '' or email = lower(trim(p_email)))
      and (p_tab = '' or tab_id = p_tab)
  ), scoped as materialized (
    select * from context where p_day is null or day = p_day
  ), days as (
    select (p_from + i)::text as day,
      v_first is not null and p_from + i >= (v_first at time zone 'Asia/Ho_Chi_Minh')::date as tracked,
      count(distinct user_id) as users,
      count(distinct (user_id,session_id)) filter (where user_id is not null) as sessions,
      coalesce(sum(active_ms),0) as active_ms,coalesce(sum(views),0) as views
    from generate_series(0,p_to-p_from) i left join context on context.day = p_from+i group by i
  ), users as (
    select user_id,email,count(distinct session_id) as sessions,count(distinct day) as days,
      min(started_at) as first_seen_at,max(last_seen_at) as last_seen_at,
      sum(active_ms) as active_ms,sum(views) as views,
      sum(chat_questions) as chat_questions,sum(exports) as exports,
      array_agg(distinct tab_id order by tab_id) as tabs
    from scoped group by user_id,email
  ), tabs as (
    select tab_id,count(distinct user_id) as users,count(distinct (user_id,session_id)) as sessions,
      sum(views) as views,sum(active_ms) as active_ms,
      sum(chat_questions) as chat_questions,sum(exports) as exports
    from scoped group by tab_id
  ), sessions as (
    select user_id,email,session_id,min(started_at) as started_at,max(last_seen_at) as last_seen_at,
      sum(active_ms) as active_ms,sum(views) as views,
      sum(chat_questions) as chat_questions,sum(exports) as exports,
      array_agg(distinct tab_id order by tab_id) as tabs
    from scoped group by user_id,email,session_id
    order by max(last_seen_at) desc,session_id limit 100
  )
  select jsonb_build_object(
    'days',coalesce((select jsonb_agg(to_jsonb(days) order by day) from days),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(to_jsonb(users) order by last_seen_at desc,email) from users),'[]'::jsonb),
    'tabs',coalesce((select jsonb_agg(to_jsonb(tabs) order by users desc,tab_id) from tabs),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(sessions) order by last_seen_at desc,session_id) from sessions),'[]'::jsonb),
    'totals',jsonb_build_object(
      'users',(select count(distinct user_id) from scoped),
      'sessions',(select count(distinct (user_id,session_id)) from scoped),
      'active_ms',(select coalesce(sum(active_ms),0) from scoped),
      'views',(select coalesce(sum(views),0) from scoped),
      'chat_questions',(select coalesce(sum(chat_questions),0) from scoped),
      'exports',(select coalesce(sum(exports),0) from scoped)),
    'options',jsonb_build_object(
      'emails',(select coalesce(jsonb_agg(email order by email),'[]'::jsonb) from (select distinct email from period) e),
      'tabs',(select coalesce(jsonb_agg(tab_id order by tab_id),'[]'::jsonb) from (select distinct tab_id from period) t)),
    'scope',jsonb_build_object('from',p_from,'to',p_to,'email',coalesce(lower(trim(p_email)),''),'tab',p_tab,'day',p_day),
    'first_tracked_at',v_first,'generated_at',now()
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.dev_app_usage_monitor(date,date,text,text,date) from public, anon;
grant execute on function public.dev_app_usage_monitor(date,date,text,text,date) to authenticated;
