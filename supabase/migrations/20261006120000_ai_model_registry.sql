-- Backend-owned model inventory. No API key or provider error body is stored.
create table public.ai_model_registry (
  id text primary key check (id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'),
  definition jsonb not null,
  source text not null default 'manual',
  enabled boolean not null default false,
  revision integer not null default 1,
  tested_revision integer,
  tested_at timestamptz,
  probe_success boolean,
  available boolean,
  chat_candidate boolean not null default false,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table public.ai_model_registry_audit (
  id bigint generated always as identity primary key,
  model_id text,
  action text not null,
  actor text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.ai_model_registry enable row level security;
alter table public.ai_model_registry_audit enable row level security;
revoke all on public.ai_model_registry, public.ai_model_registry_audit from public, anon, authenticated;
grant select, insert, update on public.ai_model_registry to service_role;
grant select, insert on public.ai_model_registry_audit to service_role;
grant usage, select on sequence public.ai_model_registry_audit_id_seq to service_role;

-- Keep existing selections and prices unchanged. These existing definitions are
-- grandfathered; newly discovered models always require an explicit probe.
insert into public.ai_model_registry(id, definition, source, enabled, tested_revision, chat_candidate)
select id, jsonb_build_object('id',id,'label',label,'reasoningEfforts',efforts,
  'defaultReasoningEffort',effort,'pricing',jsonb_build_object(
    'inputNanoUsdPerToken',input_price,'cachedInputNanoUsdPerToken',cached_price,'outputNanoUsdPerToken',output_price)),
  'legacy',true,1,true
from (values
  ('gpt-5.6-luna','GPT-5.6 Luna','["none","low","medium","high","xhigh","max"]'::jsonb,'low',200,20,1200),
  ('gpt-5.6-terra','GPT-5.6 Terra','["none","low","medium","high","xhigh","max"]'::jsonb,'low',2000,200,12000),
  ('o4-mini','o4-mini','["low","medium","high"]'::jsonb,'low',1100,275,4400),
  ('gpt-4.1','GPT-4.1','[]'::jsonb,null,2000,500,8000)
) as models(id,label,efforts,effort,input_price,cached_price,output_price);

create function public.sync_ai_model_registry(p_models jsonb, p_actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_model jsonb; v_added integer := 0; v_count integer; v_time timestamptz := now();
begin
  if jsonb_typeof(p_models) <> 'array' or jsonb_array_length(p_models) not between 1 and 10000 then
    raise exception 'MODEL_SYNC_INVALID';
  end if;
  -- Serialize inventory snapshots, including simultaneous manual/cron syncs.
  perform pg_advisory_xact_lock(610061200);
  update public.ai_model_registry set available=false;
  for v_model in select * from jsonb_array_elements(p_models) loop
    insert into public.ai_model_registry(id, definition, source, chat_candidate, available, last_seen_at)
    values (v_model->>'id', jsonb_build_object('id',v_model->>'id','label',v_model->>'id',
      'reasoningEfforts','[]'::jsonb,'defaultReasoningEffort',null,'pricing','{}'::jsonb),
      'openai',coalesce((v_model->>'chatCandidate')::boolean,false),true,v_time)
    on conflict(id) do nothing;
    get diagnostics v_count = row_count;
    v_added := v_added + v_count;
    update public.ai_model_registry set available=true,last_seen_at=v_time where id=v_model->>'id';
  end loop;
  insert into public.ai_model_registry_audit(action,actor,details)
  values ('sync',p_actor,jsonb_build_object('added',v_added,'total',jsonb_array_length(p_models)));
  return jsonb_build_object('added',v_added,'total',jsonb_array_length(p_models),'syncedAt',v_time);
end $$;

create function public.save_ai_model_definition(p_definition jsonb, p_revision integer, p_actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_old public.ai_model_registry%rowtype; v_id text := p_definition->>'id'; v_effort text; v_key text;
begin
  if v_id is null or v_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$'
    or coalesce(length(trim(p_definition->>'label')),0) not between 1 and 120
    or jsonb_typeof(p_definition->'reasoningEfforts') is distinct from 'array' then
    raise exception 'MODEL_DEFINITION_INVALID';
  end if;
  for v_effort in select jsonb_array_elements_text(p_definition->'reasoningEfforts') loop
    if v_effort not in ('none','minimal','low','medium','high','xhigh','max') then raise exception 'MODEL_REASONING_INVALID'; end if;
  end loop;
  if (jsonb_array_length(p_definition->'reasoningEfforts') > 0 and
    not (p_definition->'reasoningEfforts' ? coalesce(p_definition->>'defaultReasoningEffort','')))
    or (jsonb_array_length(p_definition->'reasoningEfforts') = 0 and p_definition->>'defaultReasoningEffort' is not null) then
    raise exception 'MODEL_REASONING_INVALID';
  end if;
  foreach v_key in array array['inputNanoUsdPerToken','cachedInputNanoUsdPerToken','outputNanoUsdPerToken'] loop
    if p_definition->'pricing'->>v_key is not null and
      (p_definition->'pricing'->>v_key !~ '^[0-9]+$' or (p_definition->'pricing'->>v_key)::numeric > 1000000) then
      raise exception 'MODEL_PRICE_INVALID';
    end if;
  end loop;
  select * into v_old from public.ai_model_registry where id=v_id for update;
  if found then
    if p_revision is distinct from v_old.revision then raise exception 'MODEL_STALE'; end if;
    if v_old.definition = p_definition then return to_jsonb(v_old); end if;
    if v_old.enabled then raise exception 'MODEL_DISABLE_BEFORE_EDIT'; end if;
    update public.ai_model_registry set definition=p_definition,revision=revision+1,tested_revision=null,
      tested_at=null,probe_success=null,updated_at=now(),updated_by=p_actor where id=v_id;
  else
    if p_revision is not null then raise exception 'MODEL_STALE'; end if;
    insert into public.ai_model_registry(id,definition,chat_candidate,updated_by) values(v_id,p_definition,true,p_actor);
  end if;
  insert into public.ai_model_registry_audit(model_id,action,actor,details)
  values(v_id,'save',p_actor,jsonb_build_object('previous',v_old.definition,'definition',p_definition));
  return (select to_jsonb(r) from public.ai_model_registry r where id=v_id);
end $$;

create function public.record_ai_model_probe(p_id text,p_revision integer,p_success boolean,p_actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  update public.ai_model_registry set tested_revision=case when p_success then revision else null end,
    tested_at=now(),probe_success=p_success,updated_by=p_actor
    where id=p_id and revision=p_revision;
  if not found then raise exception 'MODEL_STALE'; end if;
  insert into public.ai_model_registry_audit(model_id,action,actor,details)
  values(p_id,'probe',p_actor,jsonb_build_object('success',p_success,'revision',p_revision));
  return jsonb_build_object('success',p_success);
end $$;

create function public.toggle_ai_model_registry(p_id text,p_revision integer,p_enabled boolean,p_actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_row public.ai_model_registry%rowtype; v_key text;
begin
  select * into v_row from public.ai_model_registry where id=p_id for update;
  if not found or p_revision is distinct from v_row.revision then raise exception 'MODEL_STALE'; end if;
  if p_enabled then
    if v_row.tested_revision is distinct from v_row.revision then raise exception 'MODEL_PROBE_REQUIRED'; end if;
    foreach v_key in array array['inputNanoUsdPerToken','cachedInputNanoUsdPerToken','outputNanoUsdPerToken'] loop
      if v_row.definition->'pricing'->>v_key is null then raise exception 'MODEL_PRICE_REQUIRED'; end if;
    end loop;
  elsif exists(select 1 from public.ai_chat_model_config where model=p_id) then
    raise exception 'MODEL_IN_USE';
  end if;
  update public.ai_model_registry set enabled=p_enabled,updated_at=now(),updated_by=p_actor where id=p_id;
  insert into public.ai_model_registry_audit(model_id,action,actor,details)
  values(p_id,'toggle',p_actor,jsonb_build_object('enabled',p_enabled));
  return jsonb_build_object('enabled',p_enabled);
end $$;

-- Coordinate apply and disable using the same registry row lock. SMS retains its
-- legacy allowlist; this registry manages the chatbot only.
create function public.check_chat_model_registry() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_row public.ai_model_registry%rowtype;
begin
  if new.feature <> 'chat' then return new; end if;
  select * into v_row from public.ai_model_registry where id=new.model for share;
  if not found or not v_row.enabled then raise exception 'MODEL_NOT_ENABLED'; end if;
  if jsonb_array_length(v_row.definition->'reasoningEfforts') > 0 then
    if not (v_row.definition->'reasoningEfforts' ? coalesce(new.reasoning_effort,'')) then raise exception 'MODEL_REASONING_INVALID'; end if;
  elsif new.reasoning_effort is not null then raise exception 'MODEL_REASONING_INVALID'; end if;
  return new;
end $$;
create trigger check_chat_model_registry before insert or update on public.ai_chat_model_config
for each row execute function public.check_chat_model_registry();

revoke all on function public.sync_ai_model_registry(jsonb,text), public.save_ai_model_definition(jsonb,integer,text),
  public.record_ai_model_probe(text,integer,boolean,text), public.toggle_ai_model_registry(text,integer,boolean,text),
  public.check_chat_model_registry() from public, anon, authenticated;
grant execute on function public.sync_ai_model_registry(jsonb,text), public.save_ai_model_definition(jsonb,integer,text),
  public.record_ai_model_probe(text,integer,boolean,text), public.toggle_ai_model_registry(text,integer,boolean,text),
  public.check_chat_model_registry() to service_role;
