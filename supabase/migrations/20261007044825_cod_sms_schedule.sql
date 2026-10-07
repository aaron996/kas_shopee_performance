-- Install once. Runtime endpoint and CRON_SECRET are provisioned separately;
-- migration alone never dispatches a paid scoring run.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists cod_sms_private;
revoke all on schema cod_sms_private from public, anon, authenticated;
grant usage on schema cod_sms_private to authenticated, service_role;

do $$ begin
  if coalesce(current_setting('cron.timezone', true), 'GMT') not in ('GMT', 'UTC', 'Etc/UTC') then
    raise exception 'COD_SMS_CRON_REQUIRES_UTC';
  end if;
end $$;

create table public.cod_sms_schedule (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  run_time time(0) not null default '09:00' check (extract(second from run_time) = 0),
  next_run_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.cod_sms_schedule(id) values (true);
create table public.cod_sms_schedule_audit (
  id bigint generated always as identity primary key,
  previous_time time(0) not null,
  previous_enabled boolean not null,
  run_time time(0) not null,
  enabled boolean not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id)
);
create table public.cod_sms_schedule_dispatches (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','timed_out')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  request_id bigint,
  totals jsonb,
  error_code text
);
-- Only the operator provisions these; API responses never include them.
create table cod_sms_private.runtime (
  id boolean primary key default true check (id),
  endpoint text not null check (endpoint ~ '^https://[a-zA-Z0-9.-]+/api/cron/cod-sms-score$'),
  secret_id uuid not null references vault.secrets(id)
);
alter table public.cod_sms_schedule enable row level security;
alter table public.cod_sms_schedule_audit enable row level security;
alter table public.cod_sms_schedule_dispatches enable row level security;
alter table cod_sms_private.runtime enable row level security;
revoke all on public.cod_sms_schedule, public.cod_sms_schedule_audit, public.cod_sms_schedule_dispatches,
  cod_sms_private.runtime from public, anon, authenticated;
revoke all on sequence public.cod_sms_schedule_audit_id_seq from public, anon, authenticated;

create function cod_sms_private.next_run(p_time time, p_now timestamptz)
returns timestamptz language plpgsql set search_path = '' as $$
declare v_candidate timestamptz;
begin
  v_candidate := ((p_now at time zone 'Asia/Ho_Chi_Minh')::date + p_time) at time zone 'Asia/Ho_Chi_Minh';
  if v_candidate <= p_now or exists (select 1 from public.cod_sms_schedule_dispatches
    where run_date = (p_now at time zone 'Asia/Ho_Chi_Minh')::date)
    or exists (select 1 from public.cod_suspicion_sms_runs where trigger = 'cron'
      and started_at >= ((p_now at time zone 'Asia/Ho_Chi_Minh')::date::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and started_at < (((p_now at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')) then
    v_candidate := v_candidate + interval '1 day';
  end if;
  return v_candidate;
end $$;

create function cod_sms_private.read_schedule()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'COD_SMS_SCHEDULE_FORBIDDEN' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'enabled', s.enabled, 'time', to_char(s.run_time, 'HH24:MI'),
    'timezone', 'Asia/Ho_Chi_Minh',
    'nextRunAt', case when s.enabled then greatest(s.next_run_at, cod_sms_private.next_run(s.run_time, now())) end,
    'ready', exists (select 1 from cod_sms_private.runtime r join vault.decrypted_secrets v on v.id = r.secret_id where length(v.decrypted_secret) > 0),
    'updatedAt', s.updated_at, 'updatedBy', s.updated_by,
    'lastRun', (select jsonb_build_object('id', d.id,
      'status', case when d.status in ('queued','running') and d.created_at < now() - interval '10 minutes' then 'timed_out' else d.status end,
      'createdAt', d.created_at, 'startedAt', d.started_at, 'finishedAt', d.finished_at)
      from public.cod_sms_schedule_dispatches d order by d.created_at desc limit 1),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'time', to_char(a.run_time, 'HH24:MI'),
      'enabled', a.enabled, 'changedAt', a.changed_at, 'changedBy', a.changed_by) order by a.id desc)
      from (select * from public.cod_sms_schedule_audit order by id desc limit 20) a), '[]'::jsonb)
  ) into v_result from public.cod_sms_schedule s where id;
  return v_result;
end $$;

create function cod_sms_private.save_schedule(p_enabled boolean, p_time text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.cod_sms_schedule; v_time time; v_utc time; v_job bigint;
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'COD_SMS_SCHEDULE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_enabled is null or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'COD_SMS_SCHEDULE_INVALID' using errcode = '22023';
  end if;
  v_time := p_time::time;
  select * into strict v_old from public.cod_sms_schedule where id for update;
  if p_enabled and not exists (select 1 from cod_sms_private.runtime r
    join vault.decrypted_secrets v on v.id = r.secret_id where length(v.decrypted_secret) > 0) then
    raise exception 'COD_SMS_SCHEDULE_NOT_READY' using errcode = '55000';
  end if;
  -- Convert Vietnam wall-clock time to UTC for pg_cron (verified above).
  v_utc := (v_time - interval '7 hours')::time;
  v_job := cron.schedule('cod-sms-daily', format('%s %s * * *', extract(minute from v_utc)::int, extract(hour from v_utc)::int),
    'select cod_sms_private.dispatch();');
  perform cron.alter_job(v_job, active := p_enabled);
  if v_old.enabled is distinct from p_enabled or v_old.run_time is distinct from v_time then
    update public.cod_sms_schedule set enabled = p_enabled, run_time = v_time,
      next_run_at = case when p_enabled then cod_sms_private.next_run(v_time, now()) end,
      updated_at = now(), updated_by = auth.uid() where id;
    insert into public.cod_sms_schedule_audit(previous_time, previous_enabled, run_time, enabled, changed_by)
      values(v_old.run_time, v_old.enabled, v_time, p_enabled, auth.uid());
  end if;
  return cod_sms_private.read_schedule();
end $$;

create function cod_sms_private.dispatch()
returns void language plpgsql security definer set search_path = '' as $$
declare v_config public.cod_sms_schedule; v_runtime cod_sms_private.runtime; v_secret text; v_id uuid; v_request bigint;
begin
  select * into strict v_config from public.cod_sms_schedule where id for update;
  if not v_config.enabled or v_config.next_run_at > now() or v_config.next_run_at is null then return; end if;
  -- Include legacy Vercel run logs during cutover: switching schedulers after
  -- today's original cron must not create a second automatic batch today.
  if exists (select 1 from public.cod_suspicion_sms_runs where trigger = 'cron'
    and started_at >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and started_at < (((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')) then
    update public.cod_sms_schedule set next_run_at = cod_sms_private.next_run(v_config.run_time, now()) where id;
    return;
  end if;
  -- A queued old cron tick after a Dev edit cannot invoke before the new due date.
  select * into strict v_runtime from cod_sms_private.runtime where id;
  select decrypted_secret into strict v_secret from vault.decrypted_secrets where id = v_runtime.secret_id;
  insert into public.cod_sms_schedule_dispatches(run_date)
    values ((now() at time zone 'Asia/Ho_Chi_Minh')::date)
    on conflict(run_date) do nothing returning id into v_id;
  update public.cod_sms_schedule set next_run_at = cod_sms_private.next_run(v_config.run_time, now()) where id;
  if v_id is null then return; end if;
  -- Allow the scoring endpoint's 300-second runtime; request is asynchronous.
  v_request := net.http_post(url := v_runtime.endpoint,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object('dispatchId', v_id), timeout_milliseconds := 310000);
  update public.cod_sms_schedule_dispatches set request_id = v_request where id = v_id;
end $$;

create function cod_sms_private.claim_dispatch(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_claimed uuid;
begin
  -- The dispatch is committed before pg_net makes the HTTP request. Only one
  -- recipient can transition queued -> running, even for concurrent delivery.
  update public.cod_sms_schedule_dispatches set status = 'running', started_at = now()
    where id = p_id and status = 'queued' and created_at > now() - interval '10 minutes'
    returning id into v_claimed;
  return v_claimed is not null;
end $$;

create function cod_sms_private.finish_dispatch(p_id uuid, p_status text, p_totals jsonb, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('completed','partial','failed') then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  update public.cod_sms_schedule_dispatches set status = p_status, totals = p_totals,
    error_code = p_error_code, finished_at = now() where id = p_id and status = 'running';
end $$;

-- Thin invoker wrappers expose a bounded API. Privileged work stays private.
create function public.get_cod_sms_schedule() returns jsonb
language sql security invoker set search_path = '' as $$ select cod_sms_private.read_schedule() $$;
create function public.set_cod_sms_schedule(p_enabled boolean, p_time text) returns jsonb
language sql security invoker set search_path = '' as $$ select cod_sms_private.save_schedule(p_enabled, p_time) $$;
create function public.claim_cod_sms_dispatch(p_id uuid) returns boolean
language sql security invoker set search_path = '' as $$ select cod_sms_private.claim_dispatch(p_id) $$;
create function public.finish_cod_sms_dispatch(p_id uuid, p_status text, p_totals jsonb, p_error_code text) returns void
language sql security invoker set search_path = '' as $$ select cod_sms_private.finish_dispatch(p_id, p_status, p_totals, p_error_code) $$;

revoke all on all functions in schema cod_sms_private from public, anon, authenticated, service_role;
revoke all on function public.get_cod_sms_schedule(), public.set_cod_sms_schedule(boolean,text),
  public.claim_cod_sms_dispatch(uuid), public.finish_cod_sms_dispatch(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function cod_sms_private.read_schedule(), cod_sms_private.save_schedule(boolean,text),
  public.get_cod_sms_schedule(), public.set_cod_sms_schedule(boolean,text) to authenticated;
grant execute on function cod_sms_private.claim_dispatch(uuid), cod_sms_private.finish_dispatch(uuid,text,jsonb,text),
  public.claim_cod_sms_dispatch(uuid), public.finish_cod_sms_dispatch(uuid,text,jsonb,text) to service_role;
