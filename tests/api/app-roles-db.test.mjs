import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
test('role management SQL enforces dev-only writes, read RLS, audit and lockout protection', async () => {
const db = new PGlite();
await db.exec(`create role authenticated; create role anon; create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create table auth.users(id uuid primary key, email text, last_sign_in_at timestamptz);
create table public.app_user_roles(email text primary key, role text check(role in ('dev')), updated_at timestamptz default now());
create function public.is_dev_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.app_user_roles where email=auth.jwt()->>'email' and role='dev') $$;
create table public.kas_cod_suspicion_data(driver_id text, suspicion_type text);
create table public.cod_suspicion_driver_resolutions(driver_id text, suspicion_type text, finding_outcome text);
alter table public.kas_cod_suspicion_data enable row level security;
alter table public.cod_suspicion_driver_resolutions enable row level security;
grant usage on schema public,auth to authenticated, anon;
grant select on public.kas_cod_suspicion_data, public.cod_suspicion_driver_resolutions, public.app_user_roles to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-000000000001','dev@ghn.vn',now()),('00000000-0000-0000-0000-000000000002','admin@ghn.vn',now()),('00000000-0000-0000-0000-000000000003','user@ghn.vn',now()),('00000000-0000-0000-0000-000000000004','dev2@ghn.vn',now());
insert into public.app_user_roles(email,role) values ('dev@ghn.vn','dev'),('dev2@ghn.vn','dev');
create role service_role;
`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261005080000_app_dev_admin_user_roles.sql', import.meta.url),'utf8'));
await db.exec(`grant execute on function auth.jwt(),auth.uid() to authenticated; insert into public.app_user_roles(email,role) values ('admin@ghn.vn','admin'); insert into public.kas_cod_suspicion_data values ('1','Gối đầu COD'); insert into public.cod_suspicion_driver_resolutions values ('1','Gối đầu COD','non_violation');`);
const actor = async (email,id) => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claims', $1, false)`,[JSON.stringify({email,sub:'00000000-0000-0000-0000-'+id.padStart(12,'0'),role:'authenticated'})]); await db.exec('set role authenticated'); };
for (const [email,id] of [['admin@ghn.vn','2'],['user@ghn.vn','3']]) {
 await actor(email,id);
 await assert.rejects(db.query(`select public.dev_list_app_users()`),/ROLE_MANAGEMENT_FORBIDDEN/);
 await assert.rejects(db.query(`select public.dev_set_app_user_role('user@ghn.vn','dev','user')`),/ROLE_MANAGEMENT_FORBIDDEN/);
 await assert.rejects(db.query(`update public.app_user_roles set role='dev' where email=$1`,[email]),/permission denied/);
 const visible=await db.query('select * from public.kas_cod_suspicion_data'); assert.equal(visible.rows.length,email.startsWith('admin')?1:0);
 assert.equal((await db.query('select public.can_view_cod_advanced() as ok')).rows[0].ok,email.startsWith('admin'));
}
await actor('dev@ghn.vn','1');
assert.equal((await db.query(`select public.dev_list_app_users() as result`)).rows[0].result.total,4);
assert.equal((await db.query(`select public.dev_list_app_users('USER@',0) as result`)).rows[0].result.users[0].role,'user');
await assert.rejects(db.query(`select public.dev_set_app_user_role('dev@ghn.vn','user','dev')`),/ROLE_SELF_DEMOTION/);
await assert.rejects(db.query(`select public.dev_set_app_user_role('user@ghn.vn','root','user')`),/ROLE_INVALID/);
await assert.rejects(db.query(`select public.dev_set_app_user_role('nobody@ghn.vn','admin','user')`),/ROLE_USER_NOT_FOUND/);
await db.query(`select public.dev_set_app_user_role('user@ghn.vn','admin','user')`);
await assert.rejects(db.query(`select public.dev_set_app_user_role('user@ghn.vn','dev','user')`),/ROLE_CHANGED_RELOAD/);
await db.query(`select public.dev_set_app_user_role('dev2@ghn.vn','user','dev')`);
await assert.rejects(db.query(`select public.dev_set_app_user_role('dev@ghn.vn','user','dev')`),/ROLE_LAST_DEV/);
assert.equal((await db.query('select * from public.app_user_role_audit')).rows.length,2);
await actor('admin@ghn.vn','2'); assert.equal((await db.query('select * from public.app_user_role_audit')).rows.length,0);
await db.exec('reset role; set role anon');
await assert.rejects(db.query('select public.dev_list_app_users()'),/permission denied/);

await db.close();

});
