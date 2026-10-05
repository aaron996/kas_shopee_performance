-- Preserve existing dev assignments; user is the default for unassigned accounts.
alter table public.app_user_roles drop constraint if exists app_user_roles_role_check;
alter table public.app_user_roles add constraint app_user_roles_role_check check (role in ('dev', 'admin', 'user'));

create or replace function public.can_view_cod_advanced()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or exists (select 1 from public.app_user_roles
      where email = lower(coalesce(auth.jwt() ->> 'email', '')) and role in ('dev', 'admin'));
$$;
revoke all on function public.can_view_cod_advanced() from public, anon;
grant execute on function public.can_view_cod_advanced() to authenticated, service_role;

-- Read-only advanced COD access; all existing write RPCs remain dev-only.
-- Evaluate hidden conclusions under a controlled definer helper: a user's
-- resolution RLS intentionally hides non-violation rows, so NOT EXISTS in the
-- source policy alone would incorrectly make those orders visible again.
create or replace function public.can_view_cod_case(p_driver_id text, p_suspicion_type text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_view_cod_advanced() or not exists (
    select 1 from public.cod_suspicion_driver_resolutions resolution
    where resolution.driver_id = p_driver_id and resolution.suspicion_type = p_suspicion_type
      and resolution.finding_outcome = 'non_violation'
  );
$$;
revoke all on function public.can_view_cod_case(text, text) from public, anon;
grant execute on function public.can_view_cod_case(text, text) to authenticated, service_role;
drop policy if exists "authenticated_can_read_visible_cod_suspicion_data" on public.kas_cod_suspicion_data;
create policy "authenticated_can_read_visible_cod_suspicion_data" on public.kas_cod_suspicion_data
for select to authenticated using (
  public.can_view_cod_case(driver_id, suspicion_type)
);
drop policy if exists "cod_resolution_operators_can_read_all" on public.cod_suspicion_driver_resolutions;
create policy "cod_resolution_operators_can_read_all" on public.cod_suspicion_driver_resolutions
for select to authenticated using ((select public.can_view_cod_advanced()));

create table public.app_user_role_audit (
  id bigint generated always as identity primary key,
  email text not null,
  previous_role text not null,
  new_role text not null,
  changed_by uuid not null,
  changed_at timestamptz not null default now()
);
alter table public.app_user_role_audit enable row level security;
revoke all on public.app_user_role_audit from public, anon, authenticated;
grant select on public.app_user_role_audit to authenticated;
create policy "dev_read_role_audit" on public.app_user_role_audit
for select to authenticated using ((select public.is_dev_admin()));

create function public.dev_list_app_users(p_search text default '', p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'ROLE_MANAGEMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 then raise exception 'ROLE_OFFSET_INVALID'; end if;
  with users as (
    select u.id, lower(u.email) as email, coalesce(r.role, 'user') as role, u.last_sign_in_at
    from auth.users u left join public.app_user_roles r on r.email = lower(u.email)
    where (lower(u.email) like '%@ghn.vn' or lower(u.email) = 'luongthevinh996@gmail.com')
      and position(lower(trim(coalesce(p_search, ''))) in lower(u.email)) > 0
  ), page as (select * from users order by email limit 50 offset p_offset)
  select jsonb_build_object('total', (select count(*) from users), 'users',
    coalesce((select jsonb_agg(to_jsonb(page) order by email) from page), '[]'::jsonb)) into v_result;
  return v_result;
end;
$$;

create function public.dev_set_app_user_role(p_email text, p_role text, p_expected_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_previous text;
begin
  -- Serialize mutations, then recheck actor rights after acquiring the lock.
  lock table public.app_user_roles in share row exclusive mode;
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'ROLE_MANAGEMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('dev', 'admin', 'user') then raise exception 'ROLE_INVALID'; end if;
  if v_email is null or not (v_email like '%@ghn.vn' or v_email = 'luongthevinh996@gmail.com')
    or not exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'ROLE_USER_NOT_FOUND';
  end if;
  select role into v_previous from public.app_user_roles where email = v_email;
  v_previous := coalesce(v_previous, 'user');
  if p_expected_role is distinct from v_previous then raise exception 'ROLE_CHANGED_RELOAD'; end if;
  if v_previous = p_role then return p_role; end if;
  if v_previous = 'dev' and p_role <> 'dev' then
    if (select count(*) from public.app_user_roles where role = 'dev') <= 1 then
      raise exception 'ROLE_LAST_DEV';
    end if;
    if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'ROLE_SELF_DEMOTION'; end if;
  end if;
  insert into public.app_user_roles(email, role) values (v_email, p_role)
    on conflict (email) do update set role = excluded.role, updated_at = now();
  insert into public.app_user_role_audit(email, previous_role, new_role, changed_by)
    values (v_email, v_previous, p_role, auth.uid());
  return p_role;
end;
$$;
revoke all on function public.dev_list_app_users(text, integer) from public, anon;
revoke all on function public.dev_set_app_user_role(text, text, text) from public, anon;
grant execute on function public.dev_list_app_users(text, integer) to authenticated;
grant execute on function public.dev_set_app_user_role(text, text, text) to authenticated;
-- Never expose direct role writes, even for dev; mutations must use the audited RPC.
revoke insert, update, delete on public.app_user_roles from authenticated;
