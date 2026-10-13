import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

test('allowlist SQL is dev-only to manage, publicly answerable yes/no, and drives role management', async () => {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create table auth.users(id uuid primary key, email text, last_sign_in_at timestamptz);
create table public.app_user_roles(email text primary key, role text, updated_at timestamptz default now());
create table public.app_user_role_audit(id bigint generated always as identity primary key, email text, previous_role text, new_role text, changed_by uuid, changed_at timestamptz default now());
create function public.is_dev_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.app_user_roles where email=auth.jwt()->>'email' and role='dev') $$;
grant usage on schema public, auth to authenticated, anon, service_role;
grant execute on function auth.jwt(), auth.uid() to authenticated, anon;
insert into auth.users values ('00000000-0000-0000-0000-000000000001','dev@ghn.vn',now()),('00000000-0000-0000-0000-000000000002','user@ghn.vn',now()),('00000000-0000-0000-0000-000000000003','khacthienkt@gmail.com',now()),('00000000-0000-0000-0000-000000000004','stranger@gmail.com',now());
insert into public.app_user_roles(email,role) values ('dev@ghn.vn','dev');
`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261014000000_app_allowed_emails.sql', import.meta.url), 'utf8'));
  const actor = async (email, id) => {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ email, sub: '00000000-0000-0000-0000-' + id.padStart(12, '0'), role: 'authenticated' })]);
    await db.exec('set role authenticated');
  };
  const allowed = async email => (await db.query('select public.is_email_allowed($1) as ok', [email])).rows[0].ok;

  // Anyone (even anon) can ask yes/no; seeds and the ghn.vn domain are allowed.
  await db.exec('reset role; set role anon');
  assert.equal(await allowed('Someone@GHN.vn'), true);
  assert.equal(await allowed(' khacthienkt@gmail.com '), true);
  assert.equal(await allowed('luongthevinh996@gmail.com'), true);
  assert.equal(await allowed('stranger@gmail.com'), false);
  assert.equal(await allowed(null), false);
  await assert.rejects(db.query('select public.dev_list_allowed_emails()'), /permission denied/);
  await assert.rejects(db.query('select * from public.app_allowed_emails'), /permission denied/);

  // Non-dev users cannot manage the list.
  await actor('user@ghn.vn', '2');
  await assert.rejects(db.query('select public.dev_list_allowed_emails()'), /ALLOWLIST_FORBIDDEN/);
  await assert.rejects(db.query(`select public.dev_add_allowed_email('stranger@gmail.com')`), /ALLOWLIST_FORBIDDEN/);
  await assert.rejects(db.query(`select public.dev_remove_allowed_email('khacthienkt@gmail.com')`), /ALLOWLIST_FORBIDDEN/);

  // Dev can add, validate, list and remove.
  await actor('dev@ghn.vn', '1');
  await assert.rejects(db.query(`select public.dev_add_allowed_email('x@ghn.vn')`), /ALLOWLIST_GHN_IMPLICIT/);
  await assert.rejects(db.query(`select public.dev_add_allowed_email('not-an-email')`), /ALLOWLIST_EMAIL_INVALID/);
  assert.equal((await db.query(`select public.dev_add_allowed_email('  Stranger@Gmail.com ', 'đối tác') as e`)).rows[0].e, 'stranger@gmail.com');
  assert.equal(await allowed('stranger@gmail.com'), true);
  const list = (await db.query('select public.dev_list_allowed_emails() as l')).rows[0].l;
  assert.equal(list.length, 3);
  assert.equal(list.find(r => r.email === 'khacthienkt@gmail.com').signed_in, true);
  assert.equal(list.find(r => r.email === 'stranger@gmail.com').note, 'đối tác');

  // Role management follows the allowlist instead of a hardcoded address.
  const users = (await db.query(`select public.dev_list_app_users('', 0) as r`)).rows[0].r;
  assert.deepEqual(users.users.map(u => u.email).sort(), ['dev@ghn.vn', 'khacthienkt@gmail.com', 'stranger@gmail.com', 'user@ghn.vn']);
  await db.query(`select public.dev_set_app_user_role('khacthienkt@gmail.com','admin','user')`);

  await db.query(`select public.dev_remove_allowed_email('stranger@gmail.com')`);
  assert.equal(await allowed('stranger@gmail.com'), false);
  await assert.rejects(db.query(`select public.dev_set_app_user_role('stranger@gmail.com','admin','user')`), /ROLE_USER_NOT_FOUND/);
  await assert.rejects(db.query(`select public.dev_remove_allowed_email('stranger@gmail.com')`), /ALLOWLIST_NOT_FOUND/);

  // A non-ghn dev cannot lock themselves out.
  await db.exec(`reset role; insert into public.app_user_roles(email,role) values ('luongthevinh996@gmail.com','dev')`);
  await actor('luongthevinh996@gmail.com', '9');
  await assert.rejects(db.query(`select public.dev_remove_allowed_email('luongthevinh996@gmail.com')`), /ALLOWLIST_SELF_REMOVAL/);

  await db.close();
});
