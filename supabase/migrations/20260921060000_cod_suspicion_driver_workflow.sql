-- Durable, Dev Admin-only workflow metadata. KAS-221 source data stays read-only.

create table if not exists public.cod_suspicion_driver_resolutions (
  id uuid primary key default gen_random_uuid(),
  driver_id text not null,
  suspicion_type text not null check (suspicion_type in ('Gối đầu COD', 'Rút ruột')),
  status text not null default 'resolved' check (status = 'resolved'),
  contact_channel text not null check (contact_channel in ('telegram', 'gtalk', 'email', 'verbal', 'other')),
  note text not null default '' check (char_length(note) <= 4000),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  resolved_at timestamptz not null default now(),
  resolved_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cod_suspicion_driver_resolutions_driver_key_unique unique (driver_id, suspicion_type)
);

create index if not exists idx_cod_suspicion_driver_resolutions_resolved_at
  on public.cod_suspicion_driver_resolutions (resolved_at desc);

alter table public.cod_suspicion_driver_resolutions enable row level security;
revoke all on table public.cod_suspicion_driver_resolutions from public, anon, authenticated;
grant select on table public.cod_suspicion_driver_resolutions to authenticated;

drop policy if exists "authenticated_can_read_cod_driver_resolutions" on public.cod_suspicion_driver_resolutions;
create policy "authenticated_can_read_cod_driver_resolutions"
  on public.cod_suspicion_driver_resolutions for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cod-resolution-evidence',
  'cod-resolution-evidence',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated_can_read_cod_resolution_evidence" on storage.objects;
create policy "authenticated_can_read_cod_resolution_evidence"
  on storage.objects for select to authenticated
  using (bucket_id = 'cod-resolution-evidence');

drop policy if exists "dev_admin_can_upload_cod_resolution_evidence" on storage.objects;
create policy "dev_admin_can_upload_cod_resolution_evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cod-resolution-evidence'
    and (select public.is_cod_resolution_operator())
  );

drop policy if exists "dev_admin_can_update_cod_resolution_evidence" on storage.objects;
create policy "dev_admin_can_update_cod_resolution_evidence"
  on storage.objects for update to authenticated
  using (bucket_id = 'cod-resolution-evidence' and (select public.is_cod_resolution_operator()))
  with check (bucket_id = 'cod-resolution-evidence' and (select public.is_cod_resolution_operator()));

drop policy if exists "dev_admin_can_delete_cod_resolution_evidence" on storage.objects;
create policy "dev_admin_can_delete_cod_resolution_evidence"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cod-resolution-evidence' and (select public.is_cod_resolution_operator()));

create or replace function public.upsert_cod_suspicion_driver_resolution(
  p_driver_id text,
  p_suspicion_type text,
  p_contact_channel text,
  p_note text default '',
  p_attachments jsonb default '[]'::jsonb
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
    or jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
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
    driver_id, suspicion_type, contact_channel, note, attachments, resolved_at, resolved_by
  ) values (
    trim(p_driver_id), p_suspicion_type, p_contact_channel,
    left(coalesce(p_note, ''), 4000), coalesce(p_attachments, '[]'::jsonb), now(), auth.uid()
  )
  on conflict (driver_id, suspicion_type) do update
    set contact_channel = excluded.contact_channel,
        note = excluded.note,
        attachments = excluded.attachments,
        resolved_at = now(),
        resolved_by = auth.uid(),
        updated_at = now()
  returning * into v_resolution;

  return v_resolution;
end;
$$;

create or replace function public.undo_cod_suspicion_driver_resolution(
  p_driver_id text,
  p_suspicion_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_cod_resolution_operator() then
    raise exception 'COD_RESOLUTION_FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.cod_suspicion_driver_resolutions
  where driver_id = trim(p_driver_id) and suspicion_type = p_suspicion_type;
end;
$$;

revoke all on function public.upsert_cod_suspicion_driver_resolution(text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_cod_suspicion_driver_resolution(text, text, text, text, jsonb) to authenticated;
revoke all on function public.undo_cod_suspicion_driver_resolution(text, text) from public, anon, authenticated;
grant execute on function public.undo_cod_suspicion_driver_resolution(text, text) to authenticated;
