-- Allowlist of non-@ghn.vn accounts permitted to use the app. @ghn.vn stays
-- implicitly allowed; only exceptions live here. Dev manages it via audited RPCs.
create table public.app_allowed_emails (
  email text primary key check (email = lower(trim(email)) and email like '%_@_%.__%' and email not like '%@ghn.vn'),
  note text,
  added_by uuid,
  created_at timestamptz not null default now()
);
alter table public.app_allowed_emails enable row level security;
revoke all on public.app_allowed_emails from public, anon, authenticated;

insert into public.app_allowed_emails(email, note) values
  ('luongthevinh996@gmail.com', 'seed: tài khoản Dev ngoài domain'),
  ('khacthienkt@gmail.com', 'seed')
on conflict (email) do nothing;

-- Single source of truth for the access policy. Callable before login (the
-- sign-in form checks an address before sending an OTP), so it only answers
-- yes/no and never returns list contents.
create function public.is_email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(lower(trim(p_email)), '') like '%@ghn.vn'
    or exists (select 1 from public.app_allowed_emails where email = lower(trim(p_email)));
$$;
revoke all on function public.is_email_allowed(text) from public;
grant execute on function public.is_email_allowed(text) to anon, authenticated, service_role;

create function public.dev_list_allowed_emails()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'ALLOWLIST_FORBIDDEN' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'email', a.email, 'note', a.note, 'created_at', a.created_at,
      'signed_in', exists (select 1 from auth.users u where lower(u.email) = a.email)
    ) order by a.email) from public.app_allowed_emails a), '[]'::jsonb);
end;
$$;

create function public.dev_add_allowed_email(p_email text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'ALLOWLIST_FORBIDDEN' using errcode = '42501';
  end if;
  if v_email like '%@ghn.vn' then raise exception 'ALLOWLIST_GHN_IMPLICIT'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'ALLOWLIST_EMAIL_INVALID'; end if;
  insert into public.app_allowed_emails(email, note, added_by)
    values (v_email, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
    on conflict (email) do update set note = coalesce(excluded.note, public.app_allowed_emails.note);
  return v_email;
end;
$$;

create function public.dev_remove_allowed_email(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'ALLOWLIST_FORBIDDEN' using errcode = '42501';
  end if;
  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'ALLOWLIST_SELF_REMOVAL'; end if;
  delete from public.app_allowed_emails where email = v_email;
  if not found then raise exception 'ALLOWLIST_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.dev_list_allowed_emails() from public, anon;
revoke all on function public.dev_add_allowed_email(text, text) from public, anon;
revoke all on function public.dev_remove_allowed_email(text) from public, anon;
grant execute on function public.dev_list_allowed_emails() to authenticated;
grant execute on function public.dev_add_allowed_email(text, text) to authenticated;
grant execute on function public.dev_remove_allowed_email(text) to authenticated;

-- Role management follows the same policy instead of a hardcoded gmail address.
create or replace function public.dev_list_app_users(p_search text default '', p_offset integer default 0)
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
    where public.is_email_allowed(u.email)
      and position(lower(trim(coalesce(p_search, ''))) in lower(u.email)) > 0
  ), page as (select * from users order by email limit 50 offset p_offset)
  select jsonb_build_object('total', (select count(*) from users), 'users',
    coalesce((select jsonb_agg(to_jsonb(page) order by email) from page), '[]'::jsonb)) into v_result;
  return v_result;
end;
$$;

create or replace function public.dev_set_app_user_role(p_email text, p_role text, p_expected_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_previous text;
begin
  lock table public.app_user_roles in share row exclusive mode;
  if auth.uid() is null or not public.is_dev_admin() then
    raise exception 'ROLE_MANAGEMENT_FORBIDDEN' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('dev', 'admin', 'user') then raise exception 'ROLE_INVALID'; end if;
  if v_email is null or not public.is_email_allowed(v_email)
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
