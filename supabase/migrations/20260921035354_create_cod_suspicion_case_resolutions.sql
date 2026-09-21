-- Durable role and workflow metadata for KAS-221 COD suspicion cases.
-- The source table remains read-only and is refreshed independently by service_role.

create table if not exists public.app_user_roles (
  email text primary key check (email = lower(trim(email))),
  role text not null check (role in ('dev')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Initial Dev assignments. Future changes are data changes in this table, not
-- frontend allowlist edits.
insert into public.app_user_roles (email, role)
values
  ('vinhlt@ghn.vn', 'dev'),
  ('luongthevinh996@gmail.com', 'dev')
on conflict (email) do update set role = excluded.role, updated_at = now();

alter table public.app_user_roles enable row level security;
revoke all on table public.app_user_roles from public, anon, authenticated;
grant select on table public.app_user_roles to authenticated;

drop policy if exists "users_can_read_their_own_app_role" on public.app_user_roles;
create policy "users_can_read_their_own_app_role"
  on public.app_user_roles
  for select
  to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

create or replace function public.is_dev_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or exists (
      select 1
      from public.app_user_roles
      where email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and role = 'dev'
    );
$$;

revoke all on function public.is_dev_admin() from public, anon, authenticated;
grant execute on function public.is_dev_admin() to authenticated, service_role;

create table if not exists public.cod_suspicion_case_resolutions (
  id uuid primary key default gen_random_uuid(),
  order_code text not null,
  driver_id text not null,
  suspicion_type text not null check (suspicion_type in ('Gối đầu COD', 'Rút ruột')),
  status text not null default 'resolved' check (status = 'resolved'),
  resolved_at timestamptz not null default now(),
  resolved_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cod_suspicion_case_resolutions_case_key_unique
    unique (order_code, driver_id, suspicion_type)
);

create index if not exists idx_cod_suspicion_case_resolutions_resolved_at
  on public.cod_suspicion_case_resolutions (resolved_at desc);

alter table public.cod_suspicion_case_resolutions enable row level security;

create or replace function public.is_cod_resolution_operator()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_dev_admin();
$$;

revoke all on function public.is_cod_resolution_operator() from public;
grant execute on function public.is_cod_resolution_operator() to authenticated;

revoke all on table public.cod_suspicion_case_resolutions from public, anon, authenticated;
grant select on table public.cod_suspicion_case_resolutions to authenticated;

drop policy if exists "cod_resolution_operators_can_read" on public.cod_suspicion_case_resolutions;
create policy "cod_resolution_operators_can_read"
  on public.cod_suspicion_case_resolutions
  for select
  to authenticated
  using ((select public.is_cod_resolution_operator()));

-- One controlled transition: mark an existing source case as resolved. The
-- function derives resolver identity and timestamp itself; callers cannot
-- submit either value or mutate source KAS-221 data.
create or replace function public.resolve_cod_suspicion_case(
  p_order_code text,
  p_driver_id text,
  p_suspicion_type text
)
returns public.cod_suspicion_case_resolutions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resolution public.cod_suspicion_case_resolutions;
begin
  if not public.is_cod_resolution_operator() then
    raise exception 'COD_RESOLUTION_FORBIDDEN' using errcode = '42501';
  end if;

  if nullif(trim(p_order_code), '') is null
    or nullif(trim(p_driver_id), '') is null
    or p_suspicion_type not in ('Gối đầu COD', 'Rút ruột') then
    raise exception 'COD_RESOLUTION_CASE_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.kas_cod_suspicion_data source_case
    where source_case.order_code = trim(p_order_code)
      and source_case.driver_id = trim(p_driver_id)
      and source_case.suspicion_type = p_suspicion_type
  ) then
    raise exception 'COD_RESOLUTION_SOURCE_CASE_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.cod_suspicion_case_resolutions (
    order_code,
    driver_id,
    suspicion_type,
    status,
    resolved_at,
    resolved_by
  ) values (
    trim(p_order_code),
    trim(p_driver_id),
    p_suspicion_type,
    'resolved',
    now(),
    auth.uid()
  )
  on conflict (order_code, driver_id, suspicion_type) do nothing
  returning * into v_resolution;

  if v_resolution.id is null then
    select *
    into v_resolution
    from public.cod_suspicion_case_resolutions
    where order_code = trim(p_order_code)
      and driver_id = trim(p_driver_id)
      and suspicion_type = p_suspicion_type;
  end if;

  return v_resolution;
end;
$$;

revoke all on function public.resolve_cod_suspicion_case(text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_cod_suspicion_case(text, text, text) to authenticated;
