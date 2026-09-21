-- Separate the investigation conclusion from the enforcement stage. Existing
-- rows are conservatively treated as violations still in progress: they are
-- not silently presented as having completed disciplinary action.

alter table public.cod_suspicion_driver_resolutions
  add column if not exists finding_outcome text not null default 'violation'
    check (finding_outcome in ('violation', 'non_violation')),
  add column if not exists enforcement_status text
    check (enforcement_status in ('in_progress', 'disciplinary_action'));

update public.cod_suspicion_driver_resolutions
set enforcement_status = 'in_progress'
where finding_outcome = 'violation' and enforcement_status is null;

alter table public.cod_suspicion_driver_resolutions
  alter column enforcement_status set default 'in_progress';

alter table public.cod_suspicion_driver_resolutions
  drop constraint if exists cod_suspicion_driver_resolutions_outcome_stage_check;

alter table public.cod_suspicion_driver_resolutions
  add constraint cod_suspicion_driver_resolutions_outcome_stage_check
  check (
    (finding_outcome = 'non_violation' and enforcement_status is null)
    or (finding_outcome = 'violation' and enforcement_status in ('in_progress', 'disciplinary_action'))
  );

drop function if exists public.upsert_cod_suspicion_driver_resolution(text, text, text, text, jsonb);

create function public.upsert_cod_suspicion_driver_resolution(
  p_driver_id text,
  p_suspicion_type text,
  p_contact_channel text,
  p_note text default '',
  p_attachments jsonb default '[]'::jsonb,
  p_finding_outcome text default 'violation',
  p_enforcement_status text default 'in_progress'
)
returns public.cod_suspicion_driver_resolutions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.cod_suspicion_driver_resolutions;
begin
  if not public.is_cod_resolution_operator() then
    raise exception 'COD_RESOLUTION_FORBIDDEN' using errcode = '42501';
  end if;

  if nullif(trim(p_driver_id), '') is null
    or p_suspicion_type not in ('Gối đầu COD', 'Rút ruột')
    or p_contact_channel not in ('telegram', 'gtalk', 'email', 'verbal', 'other')
    or p_finding_outcome not in ('violation', 'non_violation')
    or jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array'
    or (p_finding_outcome = 'violation' and p_enforcement_status not in ('in_progress', 'disciplinary_action'))
    or (p_finding_outcome = 'non_violation' and p_enforcement_status is not null) then
    raise exception 'COD_DRIVER_RESOLUTION_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.kas_cod_suspicion_data source_case
    where source_case.driver_id = trim(p_driver_id)
      and source_case.suspicion_type = p_suspicion_type
  ) then
    raise exception 'COD_RESOLUTION_SOURCE_DRIVER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.cod_suspicion_driver_resolutions (
    driver_id, suspicion_type, contact_channel, note, attachments,
    finding_outcome, enforcement_status, resolved_at, resolved_by
  ) values (
    trim(p_driver_id), p_suspicion_type, p_contact_channel,
    left(coalesce(p_note, ''), 4000), coalesce(p_attachments, '[]'::jsonb),
    p_finding_outcome, p_enforcement_status, now(), auth.uid()
  )
  on conflict (driver_id, suspicion_type) do update
    set contact_channel = excluded.contact_channel,
        note = excluded.note,
        attachments = excluded.attachments,
        finding_outcome = excluded.finding_outcome,
        enforcement_status = excluded.enforcement_status,
        resolved_at = now(),
        resolved_by = auth.uid(),
        updated_at = now()
  returning * into v_resolution;

  return v_resolution;
end;
$$;

revoke all on function public.upsert_cod_suspicion_driver_resolution(text, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.upsert_cod_suspicion_driver_resolution(text, text, text, text, jsonb, text, text) to authenticated;
