-- App-owned PostgreSQL telemetry. Non-partitioned; one cumulative row per
-- authenticated user / page session / Vietnam day / report tab (no raw clicks).
create table public.app_usage (
  user_id uuid not null,
  email text not null,
  session_id uuid not null,
  day date not null,
  tab_id text not null check (tab_id in ('home','report1','ranking','report5','report3','report-insight','cod-suspicion','dev-admin')),
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  active_ms bigint not null check (active_ms between 0 and 86400000),
  views integer not null check (views between 0 and 100000),
  chat_questions integer not null check (chat_questions between 0 and 100000),
  exports integer not null check (exports between 0 and 100000),
  primary key (user_id, session_id, day, tab_id)
);
create index app_usage_day_email on public.app_usage(day, email);
create index app_usage_started on public.app_usage(started_at);
alter table public.app_usage enable row level security;
revoke all on public.app_usage from public, anon, authenticated;
grant select on public.app_usage to authenticated;
create policy "dev reads app usage" on public.app_usage for select to authenticated
  using ((select public.is_dev_admin()));

create function public.record_app_usage(
  p_session_id uuid, p_day date, p_tab_id text,
  p_started_at timestamptz, p_last_seen_at timestamptz,
  p_active_ms bigint, p_views integer, p_chat_questions integer default 0, p_exports integer default 0
) returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if auth.uid() is null or not public.is_email_allowed(v_email) then
    raise exception 'USAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_session_id is null or p_day is null or p_tab_id is null
    or p_started_at is null or p_last_seen_at is null or p_active_ms is null or p_views is null
    or p_chat_questions is null or p_exports is null
    or p_day < (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1
    or p_day > (now() at time zone 'Asia/Ho_Chi_Minh')::date
    or (p_started_at at time zone 'Asia/Ho_Chi_Minh')::date <> p_day
    or p_last_seen_at < p_started_at
    or p_last_seen_at > ((p_day + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
    or p_last_seen_at > now() + interval '5 minutes'
    or p_active_ms < 0 or p_active_ms > extract(epoch from (p_last_seen_at - p_started_at)) * 1000 + 1
    or p_views < 0 or p_views > 100000 or p_chat_questions not between 0 and 100000 or p_exports not between 0 and 100000 then
    raise exception 'USAGE_INVALID' using errcode = '22023';
  end if;
  insert into public.app_usage as existing
    (user_id,email,session_id,day,tab_id,started_at,last_seen_at,active_ms,views,chat_questions,exports)
  values (auth.uid(),v_email,p_session_id,p_day,p_tab_id,p_started_at,p_last_seen_at,p_active_ms,p_views,p_chat_questions,p_exports)
  on conflict (user_id,session_id,day,tab_id) do update set
    started_at = least(existing.started_at, excluded.started_at),
    last_seen_at = greatest(existing.last_seen_at, excluded.last_seen_at),
    active_ms = greatest(existing.active_ms, excluded.active_ms),
    views = greatest(existing.views, excluded.views),
    chat_questions = greatest(existing.chat_questions, excluded.chat_questions),
    exports = greatest(existing.exports, excluded.exports);
end;
$$;
revoke all on function public.record_app_usage(uuid,date,text,timestamptz,timestamptz,bigint,integer,integer,integer) from public, anon;
grant execute on function public.record_app_usage(uuid,date,text,timestamptz,timestamptz,bigint,integer,integer,integer) to authenticated;

create function public.dev_app_usage(p_days integer default 7, p_email text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; v_result jsonb;
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'USAGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (7,30) then raise exception 'USAGE_RANGE_INVALID'; end if;
  with scoped as materialized (
    select * from public.app_usage
    where day between v_today - p_days + 1 and v_today
      and (coalesce(p_email,'') = '' or email = lower(trim(p_email)))
  ), days as (
    select (v_today - i)::text as day,
      count(distinct user_id) as users,
      count(distinct (user_id,session_id)) filter (where user_id is not null) as sessions,
      coalesce(sum(active_ms),0) as active_ms, coalesce(sum(views),0) as views,
      coalesce(sum(chat_questions),0) as chat_questions, coalesce(sum(exports),0) as exports
    from generate_series(0,p_days-1) i left join scoped on scoped.day = v_today - i group by i
  ), users as (
    select user_id,email,count(distinct session_id) as sessions,count(distinct day) as days,
      sum(active_ms) as active_ms,sum(views) as views,sum(chat_questions) as chat_questions,sum(exports) as exports,max(last_seen_at) as last_seen_at,
      array_agg(distinct tab_id order by tab_id) as tabs
    from scoped group by user_id,email
  ), tabs as (
    select tab_id,count(distinct user_id) as users,count(distinct (user_id,session_id)) as sessions,
      sum(views) as views,sum(active_ms) as active_ms,sum(chat_questions) as chat_questions,sum(exports) as exports from scoped group by tab_id
  ), sessions as (
    select user_id,email,session_id,min(started_at) as started_at,max(last_seen_at) as last_seen_at,
      sum(active_ms) as active_ms,sum(views) as views,sum(chat_questions) as chat_questions,sum(exports) as exports,array_agg(distinct tab_id order by tab_id) as tabs
    from scoped group by user_id,email,session_id
    order by max(last_seen_at) desc limit 100
  )
  select jsonb_build_object(
    'days',coalesce((select jsonb_agg(to_jsonb(days) order by day) from days),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(to_jsonb(users) order by last_seen_at desc,email) from users),'[]'::jsonb),
    'tabs',coalesce((select jsonb_agg(to_jsonb(tabs) order by active_ms desc,tab_id) from tabs),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(sessions) order by last_seen_at desc) from sessions),'[]'::jsonb),
    'totals',jsonb_build_object('users',(select count(distinct user_id) from scoped),
      'sessions',(select count(distinct (user_id,session_id)) from scoped),
      'active_ms',(select coalesce(sum(active_ms),0) from scoped),
      'views',(select coalesce(sum(views),0) from scoped),
      'chat_questions',(select coalesce(sum(chat_questions),0) from scoped),
      'exports',(select coalesce(sum(exports),0) from scoped)),
    'first_tracked_at',(select min(started_at) from public.app_usage),
    'generated_at',now()
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.dev_app_usage(integer,text) from public, anon;
grant execute on function public.dev_app_usage(integer,text) to authenticated;
