-- Install before deploying the API. This never replays historical scoring.
alter table public.cod_suspicion_sms_runs
  drop constraint cod_suspicion_sms_runs_status_check,
  add constraint cod_suspicion_sms_runs_status_check check (status in ('running','completed','partial','aborted','failed')),
  add column last_progress_at timestamptz not null default now();
-- Explicit attribution makes crash recovery independent of clock skew and
-- prevents another concurrently completed run from being counted as this one.
alter table public.cod_suspicion_sms_assessments add column scoring_run_id uuid
  references public.cod_suspicion_sms_runs(id) on delete set null;
alter table public.cod_sms_schedule_dispatches
  add column run_id uuid references public.cod_suspicion_sms_runs(id),
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column last_dispatched_at timestamptz not null default now(),
  add column chunk_failures integer not null default 0,
  add column scoring_config jsonb;
create unique index cod_sms_dispatch_run on public.cod_sms_schedule_dispatches(run_id) where run_id is not null;
create index cod_sms_dispatch_active on public.cod_sms_schedule_dispatches(created_at) where status in ('queued','running');
create index cod_sms_run_active on public.cod_suspicion_sms_runs(last_progress_at) where status='running';

-- A case key is frozen for the daily dispatch. SMS content remains in its
-- original restricted table, and source changes cannot shift an offset cursor.
create table cod_sms_private.dispatch_cases (
  dispatch_id uuid not null references public.cod_sms_schedule_dispatches(id) on delete cascade,
  position integer not null,
  suspicion_type text not null,
  driver_id text not null,
  order_code text not null,
  done boolean not null default false,
  primary key (dispatch_id, suspicion_type, driver_id, order_code),
  unique (dispatch_id, position)
);
create index cod_sms_dispatch_remaining on cod_sms_private.dispatch_cases(dispatch_id, position) where not done;
alter table cod_sms_private.dispatch_cases enable row level security;
revoke all on cod_sms_private.dispatch_cases from public, anon, authenticated, service_role;
create unique index cod_sms_run_item_case on public.cod_suspicion_sms_run_items(run_id,suspicion_type,driver_id,order_code);

create function cod_sms_private.record_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.cod_suspicion_sms_runs set
    claimed = claimed + (new.outcome <> 'skipped_unchanged')::integer,
    scored = scored + (new.outcome = 'scored')::integer,
    no_evidence = no_evidence + (new.outcome = 'no_evidence')::integer,
    failed = failed + (new.outcome = 'failed')::integer,
    skipped_unchanged = skipped_unchanged + (new.outcome = 'skipped_unchanged')::integer,
    last_progress_at = now()
  where id = new.run_id;
  update cod_sms_private.dispatch_cases c set done = true
  from public.cod_sms_schedule_dispatches d
  where d.id = c.dispatch_id and d.run_id = new.run_id
    and c.suspicion_type = new.suspicion_type and c.driver_id = new.driver_id and c.order_code = new.order_code;
  return new;
end $$;
create trigger cod_sms_item_progress after insert on public.cod_suspicion_sms_run_items
  for each row execute function cod_sms_private.record_progress();

create function cod_sms_private.claim_chunk(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  update public.cod_sms_schedule_dispatches set status = 'running',
    started_at = coalesce(started_at,now()), lease_token = gen_random_uuid(), lease_until = now()+interval '6 minutes'
  where id = p_id and status in ('queued','running')
    and created_at > now()-interval '24 hours'
    and (lease_until is null or lease_until < now())
    and exists (select 1 from public.cod_sms_schedule where id and enabled)
  returning lease_token into v_token;
  return v_token;
end $$;

create function cod_sms_private.prepare_chunk(p_id uuid,p_token uuid,p_config jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_dispatch public.cod_sms_schedule_dispatches; v_run public.cod_suspicion_sms_runs;
begin
  select * into v_dispatch from public.cod_sms_schedule_dispatches
    where id=p_id and lease_token=p_token and lease_until>now() and status='running' for update;
  if not found then raise exception 'COD_SMS_LEASE_LOST'; end if;
  if v_dispatch.run_id is null then
    if nullif(p_config->>'model','') is null or nullif(p_config->>'rubricVersion','') is null
      or octet_length(p_config::text)>2000 then raise exception 'COD_SMS_CONFIG_INVALID'; end if;
    insert into public.cod_suspicion_sms_runs(trigger,mode,model,rubric_version,force)
      values ('cron','sweep',p_config->>'model',p_config->>'rubricVersion',false) returning * into v_run;
    insert into cod_sms_private.dispatch_cases(dispatch_id,position,suspicion_type,driver_id,order_code)
      select p_id,row_number() over(order by driver_id,order_code,suspicion_type)::integer,suspicion_type,driver_id,order_code
      from public.kas_cod_suspicion_data where signal_count_over_p90 = true and call_verification_priority = 'Cao'
      order by driver_id,order_code,suspicion_type limit 10001;
    if (select count(*) from cod_sms_private.dispatch_cases where dispatch_id=p_id)>10000 then
      raise exception 'COD_SMS_DISPATCH_SCOPE_TOO_LARGE';
    end if;
    update public.cod_suspicion_sms_runs set found=(select count(*) from cod_sms_private.dispatch_cases where dispatch_id=p_id)
      where id=v_run.id returning * into v_run;
    update public.cod_sms_schedule_dispatches set run_id=v_run.id,scoring_config=p_config where id=p_id
      returning * into v_dispatch;
  else
    select * into strict v_run from public.cod_suspicion_sms_runs where id=v_dispatch.run_id;
  end if;
  return jsonb_build_object('runId',v_run.id,'startedAt',v_run.started_at,'config',v_dispatch.scoring_config);
end $$;

create function cod_sms_private.next_cases(p_id uuid,p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.cod_sms_schedule_dispatches where id=p_id
    and lease_token=p_token and lease_until>now() and status='running') then raise exception 'COD_SMS_LEASE_LOST'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('suspicionType',c.suspicion_type,
    'driverId',c.driver_id,'orderCode',c.order_code) order by c.position)
    from (select * from cod_sms_private.dispatch_cases where dispatch_id=p_id and not done order by position limit 25) c),'[]'::jsonb);
end $$;

create function cod_sms_private.finish_chunk(p_id uuid,p_token uuid,p_error text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_dispatch public.cod_sms_schedule_dispatches; v_run public.cod_suspicion_sms_runs; v_status text; v_totals jsonb;
begin
  select * into v_dispatch from public.cod_sms_schedule_dispatches where id=p_id
    and lease_token=p_token and lease_until>now() and status='running' for update;
  if not found then raise exception 'COD_SMS_LEASE_LOST'; end if;
  select * into v_run from public.cod_suspicion_sms_runs where id=v_dispatch.run_id;
  if p_error is not null and v_dispatch.chunk_failures>=2 then
    v_status := 'failed';
  elsif p_error is not null or v_dispatch.run_id is null or exists
    (select 1 from cod_sms_private.dispatch_cases where dispatch_id=p_id and not done) then
    v_status := 'queued';
  else
    v_status := case when v_run.failed>0 then 'partial' else 'completed' end;
  end if;
  v_totals := jsonb_build_object('found',coalesce(v_run.found,0),'claimed',coalesce(v_run.claimed,0),
    'scored',coalesce(v_run.scored,0),'noEvidence',coalesce(v_run.no_evidence,0),
    'failed',coalesce(v_run.failed,0),'skippedUnchanged',coalesce(v_run.skipped_unchanged,0));
  update public.cod_sms_schedule_dispatches set status=v_status,lease_token=null,lease_until=null,
    chunk_failures=case when p_error is null then 0 else chunk_failures+1 end,
    totals=v_totals,error_code=left(p_error,100),
    finished_at=case when v_status<>'queued' then now() end where id=p_id;
  update public.cod_suspicion_sms_runs set status=case when v_status='queued' then 'running' else v_status end,
    error_code=case when v_status='failed' then left(p_error,100) end,
    error_message=case when v_status='failed' then 'Không thể tiếp tục batch SMS sau 3 lần thử.' end,
    finished_at=case when v_status<>'queued' then now() end,last_progress_at=now() where id=v_dispatch.run_id;
  return jsonb_build_object('status',v_status,'totals',v_totals,'continuing',v_status='queued');
end $$;

-- Close orphan logs using their actual item counts, never mark them completed.
create function cod_sms_private.reconcile_runs()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.cod_suspicion_sms_runs r set status='aborted',finished_at=now(),
    error_code='COD_SMS_RUN_INTERRUPTED',error_message='Batch bị ngắt trước khi hoàn tất; kết quả từng đơn đã lưu vẫn được giữ.',
    found=greatest(r.found,(select count(*) from public.cod_suspicion_sms_run_items i where i.run_id=r.id)),
    claimed=(select count(*) from public.cod_suspicion_sms_run_items i where i.run_id=r.id and outcome<>'skipped_unchanged'),
    scored=(select count(*) from public.cod_suspicion_sms_run_items i where i.run_id=r.id and outcome='scored'),
    no_evidence=(select count(*) from public.cod_suspicion_sms_run_items i where i.run_id=r.id and outcome='no_evidence'),
    failed=(select count(*) from public.cod_suspicion_sms_run_items i where i.run_id=r.id and outcome='failed'),
    skipped_unchanged=(select count(*) from public.cod_suspicion_sms_run_items i where i.run_id=r.id and outcome='skipped_unchanged')
  where status='running' and greatest(r.started_at,r.last_progress_at,
    coalesce((select max(created_at) from public.cod_suspicion_sms_run_items i where i.run_id=r.id),r.started_at))<now()-interval '10 minutes'
    and not exists(select 1 from public.cod_sms_schedule_dispatches d where d.run_id=r.id
      and d.created_at>now()-interval '24 hours' and d.status in ('queued','running'));
  update public.cod_sms_schedule_dispatches set status='timed_out',finished_at=now(),lease_token=null,lease_until=null,
    error_code='COD_SMS_RUN_INTERRUPTED' where status in ('queued','running')
    and (created_at<now()-interval '24 hours' or (run_id is null and created_at<now()-interval '10 minutes'));
end $$;

-- Use a periodic DB tick instead of chaining HTTP calls inside the function.
-- A lost HTTP request or crashed worker is retried after the bounded lease.
create function cod_sms_private.resume_dispatches()
returns void language plpgsql security definer set search_path = '' as $$
declare v_dispatch public.cod_sms_schedule_dispatches; v_runtime cod_sms_private.runtime; v_secret text; v_request bigint;
begin
  perform cod_sms_private.reconcile_runs();
  if not exists(select 1 from public.cod_sms_schedule where id and enabled) then return; end if;
  select * into v_dispatch from public.cod_sms_schedule_dispatches
    where status in ('queued','running') and created_at>now()-interval '24 hours'
      and (lease_until is null or lease_until<now()) and last_dispatched_at<now()-interval '1 minute'
    order by created_at for update skip locked limit 1;
  if not found then return; end if;
  select * into strict v_runtime from cod_sms_private.runtime where id;
  select decrypted_secret into strict v_secret from vault.decrypted_secrets where id=v_runtime.secret_id;
  v_request := net.http_post(url:=v_runtime.endpoint,
    headers:=jsonb_build_object('Authorization','Bearer '||v_secret,'Content-Type','application/json'),
    body:=jsonb_build_object('dispatchId',v_dispatch.id),timeout_milliseconds:=310000);
  update public.cod_sms_schedule_dispatches set request_id=v_request,last_dispatched_at=now() where id=v_dispatch.id;
end $$;

create function public.claim_cod_sms_chunk(p_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select cod_sms_private.claim_chunk(p_id) $$;
create function public.prepare_cod_sms_chunk(p_id uuid,p_token uuid,p_config jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select cod_sms_private.prepare_chunk(p_id,p_token,p_config) $$;
create function public.next_cod_sms_cases(p_id uuid,p_token uuid) returns jsonb
language sql security invoker set search_path='' as $$ select cod_sms_private.next_cases(p_id,p_token) $$;
create function public.finish_cod_sms_chunk(p_id uuid,p_token uuid,p_error text) returns jsonb
language sql security invoker set search_path='' as $$ select cod_sms_private.finish_chunk(p_id,p_token,p_error) $$;
create function public.reconcile_cod_sms_runs() returns void
language sql security invoker set search_path='' as $$ select cod_sms_private.reconcile_runs() $$;

create or replace function cod_sms_private.read_schedule()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'COD_SMS_SCHEDULE_FORBIDDEN' using errcode='42501';
  end if;
  select jsonb_build_object('enabled',s.enabled,'time',to_char(s.run_time,'HH24:MI'),
    'timezone','Asia/Ho_Chi_Minh',
    'nextRunAt',case when s.enabled then greatest(s.next_run_at,cod_sms_private.next_run(s.run_time,now())) end,
    'ready',exists(select 1 from cod_sms_private.runtime r join vault.decrypted_secrets v on v.id=r.secret_id where length(v.decrypted_secret)>0),
    'updatedAt',s.updated_at,'updatedBy',s.updated_by,
    'lastRun',(select jsonb_build_object('id',d.id,
      'status',case when d.status in ('queued','running') and
        (d.created_at<now()-interval '24 hours' or (d.run_id is null and d.created_at<now()-interval '10 minutes'))
        then 'timed_out' else d.status end,
      'createdAt',d.created_at,'startedAt',d.started_at,'finishedAt',d.finished_at)
      from public.cod_sms_schedule_dispatches d order by d.created_at desc limit 1),
    'history',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'time',to_char(a.run_time,'HH24:MI'),
      'enabled',a.enabled,'changedAt',a.changed_at,'changedBy',a.changed_by) order by a.id desc)
      from (select * from public.cod_sms_schedule_audit order by id desc limit 20) a),'[]'::jsonb))
    into v_result from public.cod_sms_schedule s where id;
  return v_result;
end $$;

-- During rollout an older deployment may still receive an HTTP request.
-- It must not claim the new queue using its unbounded legacy sweep.
create or replace function cod_sms_private.claim_dispatch(p_id uuid)
returns boolean language sql security definer set search_path='' as $$ select false $$;
revoke execute on function cod_sms_private.finish_dispatch(uuid,text,jsonb,text),
  public.finish_cod_sms_dispatch(uuid,text,jsonb,text) from service_role;

revoke all on function cod_sms_private.record_progress(),cod_sms_private.claim_chunk(uuid),
  cod_sms_private.prepare_chunk(uuid,uuid,jsonb),cod_sms_private.next_cases(uuid,uuid),
  cod_sms_private.finish_chunk(uuid,uuid,text),cod_sms_private.reconcile_runs(),cod_sms_private.resume_dispatches(),
  public.claim_cod_sms_chunk(uuid),public.prepare_cod_sms_chunk(uuid,uuid,jsonb),public.next_cod_sms_cases(uuid,uuid),
  public.finish_cod_sms_chunk(uuid,uuid,text),public.reconcile_cod_sms_runs() from public,anon,authenticated,service_role;
grant execute on function cod_sms_private.claim_chunk(uuid),cod_sms_private.prepare_chunk(uuid,uuid,jsonb),
  cod_sms_private.next_cases(uuid,uuid),cod_sms_private.finish_chunk(uuid,uuid,text),cod_sms_private.reconcile_runs(),
  public.claim_cod_sms_chunk(uuid),public.prepare_cod_sms_chunk(uuid,uuid,jsonb),public.next_cod_sms_cases(uuid,uuid),
  public.finish_cod_sms_chunk(uuid,uuid,text),public.reconcile_cod_sms_runs() to service_role;

-- Existing stuck rows belong to the pre-lease implementation. Repair their
-- summaries but do not enqueue paid retries just by installing this migration.
update public.cod_suspicion_sms_runs set last_progress_at=started_at;
select cod_sms_private.reconcile_runs();
select cron.schedule('cod-sms-resume','* * * * *','select cod_sms_private.resume_dispatches();');
