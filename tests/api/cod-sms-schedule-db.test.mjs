import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('scheduler SQL enforces Dev, UTC conversion, atomic edits, one dispatch/day and one claim', async () => {
  const db = new PGlite();
  const devId = '00000000-0000-0000-0000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema vault; create schema cron; create schema net;
      create table auth.users(id uuid primary key);
      create table public.cod_suspicion_sms_runs(trigger text, started_at timestamptz);
      insert into auth.users values ('${devId}');
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
      create function public.is_dev_admin() returns boolean language sql as $$ select current_setting('test.dev',true) = 'true' $$;
      create table vault.secrets(id uuid primary key, secret text);
      create view vault.decrypted_secrets as select id, secret as decrypted_secret from vault.secrets;
      create table cron.job(jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text, active boolean default true);
      create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language sql as $$
        insert into cron.job(jobname,schedule,command) values(p_name,p_schedule,p_command)
        on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;
      create function cron.alter_job(p_job bigint,active boolean) returns void language sql as $$ update cron.job set active=$2 where jobid=$1 $$;
      create table net.requests(id bigint generated always as identity, url text, headers jsonb, body jsonb, timeout integer);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
        insert into net.requests(url,headers,body,timeout) values($1,$2,$3,$4) returning id $$;
      grant usage on schema public,auth to authenticated,service_role;
    `);
    const source = await readFile(new URL('../../supabase/migrations/20261007044825_cod_sms_schedule.sql', import.meta.url), 'utf8');
    // PGlite executes PostgreSQL functions/RLS, but cannot run background cron,
    // Vault crypto or pg_net workers. Stub only those extension entry points.
    await db.exec(source.replace(/^create extension .*;$/gm, ''));
    const actor = async dev => {
      await db.exec('reset role');
      await db.query(`select set_config('test.actor',$1,false),set_config('test.dev',$2,false)`, [devId, String(dev)]);
      await db.exec('set role authenticated');
    };
    await actor(false);
    await assert.rejects(db.query('select public.get_cod_sms_schedule()'), /FORBIDDEN/);
    await assert.rejects(db.query(`select public.set_cod_sms_schedule(true,'05:30')`), /FORBIDDEN/);
    await actor(true);
    await assert.rejects(db.query('select * from public.cod_sms_schedule'), /permission denied/);
    await assert.rejects(db.query('select cod_sms_private.dispatch()'), /permission denied/);
    await assert.rejects(db.query(`select public.claim_cod_sms_dispatch('${devId}')`), /permission denied/);
    await assert.rejects(db.query(`select public.set_cod_sms_schedule(true,'24:00')`), /INVALID/);
    await assert.rejects(db.query(`select public.set_cod_sms_schedule(true,'05:30')`), /NOT_READY/);
    const initial = (await db.query('select public.get_cod_sms_schedule() as data')).rows[0].data;
    assert.equal(initial.ready, false); assert.equal(initial.enabled, false); assert.equal(initial.time, '09:00');
    await db.exec('reset role');
    await db.query(`insert into vault.secrets values ($1,'test-secret')`, [devId]);
    await db.query(`insert into cod_sms_private.runtime values (true,'https://example.vercel.app/api/cron/cod-sms-score',$1)`, [devId]);
    await actor(true);
    for (const [time, expression] of [['05:30','30 22 * * *'],['09:00','0 2 * * *'],['00:00','0 17 * * *'],['23:59','59 16 * * *']]) {
      const data = (await db.query('select public.set_cod_sms_schedule(true,$1) as data', [time])).rows[0].data;
      assert.equal(data.time,time); assert.equal(data.ready,true); assert.equal(data.updatedBy,devId);
      assert.ok(new Date(data.nextRunAt) > new Date());
      assert.equal(JSON.stringify(data).includes('test-secret'),false);
      await db.exec('reset role');
      assert.equal((await db.query('select schedule from cron.job')).rows[0].schedule,expression);
      await actor(true);
    }
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as count from cron.job')).rows[0].count,1);
    // Vietnam day boundary: 16:59 UTC = 23:59 today, 17:00 UTC = midnight tomorrow.
    assert.equal((await db.query(`select cod_sms_private.next_run('00:00','2026-10-07T16:59:00Z') as due`)).rows[0].due.toISOString(), '2026-10-07T17:00:00.000Z');
    assert.equal((await db.query(`select cod_sms_private.next_run('00:00','2026-10-07T17:00:00Z') as due`)).rows[0].due.toISOString(), '2026-10-08T17:00:00.000Z');
    await db.exec(`update public.cod_sms_schedule set next_run_at=now()-interval '1 minute'; select cod_sms_private.dispatch(); select cod_sms_private.dispatch();`);
    const dispatch = (await db.query('select * from public.cod_sms_schedule_dispatches')).rows[0];
    assert.ok(dispatch.id);
    assert.equal((await db.query('select count(*)::int as count from net.requests')).rows[0].count,1);
    // Force an extra tick: unique VN date prevents a second scoring dispatch.
    await db.exec(`update public.cod_sms_schedule set next_run_at=now()-interval '1 minute'; select cod_sms_private.dispatch();`);
    assert.equal((await db.query('select count(*)::int as count from net.requests')).rows[0].count,1);
    await db.exec('set role service_role');
    assert.equal((await db.query('select public.claim_cod_sms_dispatch($1) as claimed',[dispatch.id])).rows[0].claimed,true);
    assert.equal((await db.query('select public.claim_cod_sms_dispatch($1) as claimed',[dispatch.id])).rows[0].claimed,false);
    await db.query(`select public.finish_cod_sms_dispatch($1,'completed','{"scored":3}',null)`, [dispatch.id]);
    await actor(true);
    const saved = (await db.query(`select public.set_cod_sms_schedule(false,'09:00') as data`)).rows[0].data;
    assert.equal(saved.nextRunAt,null); assert.equal(saved.lastRun.status,'completed'); assert.equal(saved.history.length,5);
    assert.equal(saved.history[0].changedBy,devId);
    await db.exec('reset role');
    assert.equal((await db.query('select active from cron.job')).rows[0].active,false);
    await db.exec(`select cod_sms_private.dispatch()`);
    assert.equal((await db.query('select count(*)::int as count from net.requests')).rows[0].count,1);
    // Historical Vercel cron still counts during the day of scheduler cutover.
    await db.exec(`delete from public.cod_sms_schedule_dispatches; insert into public.cod_suspicion_sms_runs values ('cron',now());`);
    await actor(true);
    const switched = (await db.query(`select public.set_cod_sms_schedule(true,'23:59') as data`)).rows[0].data;
    await db.exec('reset role');
    const tomorrow = (await db.query(`select ((now() at time zone 'Asia/Ho_Chi_Minh')::date+1)::text as day`)).rows[0].day;
    assert.equal(new Date(new Date(switched.nextRunAt).getTime()+7*3600000).toISOString().slice(0,10), tomorrow);
    await db.exec(`update public.cod_sms_schedule set next_run_at=now()-interval '1 minute'; select cod_sms_private.dispatch();`);
    assert.equal((await db.query('select count(*)::int as count from net.requests')).rows[0].count,1);
  } finally { await db.close(); }
});
