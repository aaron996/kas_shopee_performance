-- Both features use the enabled registry and validate reasoning under its row lock.
create or replace function public.check_chat_model_registry() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_row public.ai_model_registry%rowtype;
begin
  if new.feature not in ('chat','cod_sms') then return new; end if;
  if new.feature = 'cod_sms' and new.scope_type <> 'all' then raise exception 'MODEL_COD_SCOPE_INVALID'; end if;
  select * into v_row from public.ai_model_registry where id=new.model for share;
  if not found or not v_row.enabled then raise exception 'MODEL_NOT_ENABLED'; end if;
  if jsonb_array_length(v_row.definition->'reasoningEfforts') > 0 then
    if not (v_row.definition->'reasoningEfforts' ? coalesce(new.reasoning_effort,'')) then raise exception 'MODEL_REASONING_INVALID'; end if;
  elsif new.reasoning_effort is not null then raise exception 'MODEL_REASONING_INVALID'; end if;
  return new;
end $$;

-- 'minimal' is supported by the registry; model-specific combinations stay guarded.
alter table public.ai_chat_model_config drop constraint ai_chat_model_config_reasoning_effort_check;
alter table public.ai_chat_model_config add constraint ai_chat_model_config_reasoning_effort_check
  check (reasoning_effort is null or reasoning_effort in ('none','minimal','low','medium','high','xhigh','max'));
