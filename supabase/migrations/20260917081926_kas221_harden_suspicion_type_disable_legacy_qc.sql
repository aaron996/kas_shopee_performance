-- KAS-221 forward-only hardening. The original 20260917 migration has already
-- been applied remotely, so edits to that file cannot repair existing schemas.
-- Keep user_module_roles and every saved assignment for a future QC rollout.

drop function if exists public.admin_list_users_qc_roles(text);
drop function if exists public.admin_set_user_qc_role(uuid, text, boolean);

do $$
begin
  if to_regclass('public.user_module_roles') is not null then
    -- Old installations may still carry these policies and grants. Removing
    -- the policies prevents a later table grant from reviving QC access.
    execute 'drop policy if exists "dev admin can manage user_module_roles" on public.user_module_roles';
    execute 'drop policy if exists "users can read their own module roles" on public.user_module_roles';
    execute 'revoke all on table public.user_module_roles from public, anon, authenticated';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.kas_cod_suspicion_data'::regclass
      and conname = 'kas_cod_suspicion_data_suspicion_type_check'
  ) then
    alter table public.kas_cod_suspicion_data
      add constraint kas_cod_suspicion_data_suspicion_type_check
      check (suspicion_type in ('Gối đầu COD', 'Rút ruột'));
  end if;
end
$$;
