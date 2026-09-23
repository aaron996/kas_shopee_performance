-- Presentation-only COD SMS escalation threshold. Existing SMS scores are never updated.
create table public.cod_sms_escalation_config (
  id boolean primary key default true check (id),
  threshold smallint not null default 1 check (threshold between 1 and 9),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.cod_sms_escalation_config (id, threshold) values (true, 1);

create table public.cod_sms_escalation_config_audit (
  id bigint generated always as identity primary key,
  previous_threshold smallint not null check (previous_threshold between 1 and 9),
  new_threshold smallint not null check (new_threshold between 1 and 9),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id)
);

alter table public.cod_sms_escalation_config enable row level security;
alter table public.cod_sms_escalation_config_audit enable row level security;
revoke all on public.cod_sms_escalation_config, public.cod_sms_escalation_config_audit from public, anon, authenticated;
revoke all on sequence public.cod_sms_escalation_config_audit_id_seq from public, anon, authenticated;
grant select on public.cod_sms_escalation_config to service_role;
-- The API reads through its server-only service client and returns only the
-- effective integer to ordinary users. No direct browser table access.

-- No client INSERT/UPDATE/DELETE policy or grant. Writes are serialized here and
-- the actor is derived from the verified JWT, never from request data.
create function public.set_cod_sms_escalation_threshold(p_threshold numeric)
returns public.cod_sms_escalation_config
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous smallint;
  v_result public.cod_sms_escalation_config;
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'COD_SMS_THRESHOLD_FORBIDDEN' using errcode = '42501';
  end if;
  if p_threshold is null or p_threshold <> trunc(p_threshold) or p_threshold < 1 or p_threshold > 9 then
    raise exception 'COD_SMS_THRESHOLD_INVALID' using errcode = '22023';
  end if;

  select threshold into v_previous
  from public.cod_sms_escalation_config where id = true for update;
  if not found then
    raise exception 'COD_SMS_THRESHOLD_MISSING' using errcode = 'P0002';
  end if;

  update public.cod_sms_escalation_config
  set threshold = p_threshold::smallint, updated_at = now(), updated_by = auth.uid()
  where id = true returning * into v_result;

  insert into public.cod_sms_escalation_config_audit
    (previous_threshold, new_threshold, changed_by)
  values (v_previous, p_threshold::smallint, auth.uid());
  return v_result;
end;
$$;

revoke all on function public.set_cod_sms_escalation_threshold(numeric) from public, anon, authenticated;
grant execute on function public.set_cod_sms_escalation_threshold(numeric) to authenticated;
