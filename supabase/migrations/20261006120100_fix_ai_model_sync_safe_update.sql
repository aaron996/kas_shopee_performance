-- PostgREST sessions enforce pg-safeupdate: inventory writes need a WHERE clause.
create or replace function public.sync_ai_model_registry(p_models jsonb, p_actor text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_model jsonb; v_added integer := 0; v_count integer; v_time timestamptz := now();
begin
  if jsonb_typeof(p_models) <> 'array' or jsonb_array_length(p_models) not between 1 and 10000 then
    raise exception 'MODEL_SYNC_INVALID';
  end if;
  -- Serialize inventory snapshots, including simultaneous manual/cron syncs.
  perform pg_advisory_xact_lock(610061200);
  update public.ai_model_registry set available=false
    where available is distinct from false;
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

