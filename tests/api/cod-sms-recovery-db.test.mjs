import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const actorId = '00000000-0000-0000-0000-000000000001';
const config = { model: 'gpt-6-luna', rubricVersion: 'test', reasoningEffort: 'max', maxOutputTokens: 8192, modelTimeoutMs: 60000 };
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema vault; create schema cron; create schema net;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function public.is_dev_admin() returns boolean language sql as $$ select current_setting('test.dev',true)='true' $$;
    create table vault.secrets(id uuid primary key,secret text);
    create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
    create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname)
      do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;
    create function cron.alter_job(bigint,active boolean) returns void language sql as $$ update cron.job set active=$2 where jobid=$1 $$;
    create table net.requests(id bigint generated always as identity,url text,headers jsonb,body jsonb,timeout integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
      insert into net.requests(url,headers,body,timeout) values($1,$2,$3,$4) returning id $$;
    create table public.kas_cod_suspicion_data(suspicion_type text,driver_id text,order_code text,
      signal_count_over_p90 boolean,call_verification_priority text);
    create table public.cod_suspicion_sms_assessments(id uuid primary key);
    insert into public.kas_cod_suspicion_data values ('Gối đầu COD','1','A',true,'Cao'),('Gối đầu COD','1','B',true,'Cao');
    grant usage on schema public,auth to authenticated,service_role;
  `);
  for (const name of ['20260923071652_cod_sms_scoring_runs.sql','20261007044825_cod_sms_schedule.sql']) {
    await db.exec((await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).replace(/^create extension .*;$/gm,''));
  }
  // Preserve historical completed rows while repairing unfinished totals.
  await db.exec(`insert into public.cod_suspicion_sms_runs(id,trigger,mode,model,rubric_version,started_at)
    values ('${actorId}','cron','sweep','old','old',now()-interval '1 hour');
    insert into public.cod_suspicion_sms_run_items(run_id,suspicion_type,driver_id,order_code,outcome,created_at)
    values ('${actorId}','Gối đầu COD','1','OLD-A','scored',now()-interval '55 minutes'),
      ('${actorId}','Gối đầu COD','1','OLD-B','failed',now()-interval '55 minutes');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261019043033_cod_sms_resumable_batches.sql',import.meta.url),'utf8'));
  await db.exec(`update public.cod_sms_schedule set enabled=true;
    insert into vault.secrets values ('${actorId}','test-secret');
    insert into cod_sms_private.runtime values (true,'https://example.vercel.app/api/cron/cod-sms-score','${actorId}');`);
  return db;
}
async function start(db) {
  const id = (await db.query(`insert into public.cod_sms_schedule_dispatches(run_date) values(current_date) returning id`)).rows[0].id;
  await db.exec('set role service_role');
  const token = (await db.query('select public.claim_cod_sms_chunk($1) as token',[id])).rows[0].token;
  const run = (await db.query('select public.prepare_cod_sms_chunk($1,$2,$3) as run',[id,token,config])).rows[0].run;
  return { id, token, ...run };
}
async function item(db,runId,code,outcome) {
  await db.query(`insert into public.cod_suspicion_sms_run_items(run_id,suspicion_type,driver_id,order_code,outcome)
    values ($1,'Gối đầu COD','1',$2,$3) on conflict do nothing`,[runId,code,outcome]);
}

test('recovery migration repairs stale totals without replaying scoring or exposing the queue', async () => {
  const db = await fixture();
  try {
    const r = (await db.query('select * from public.cod_suspicion_sms_runs where id=$1',[actorId])).rows[0];
    assert.equal(r.status,'aborted'); assert.equal(r.scored,1); assert.equal(r.failed,1); assert.equal(r.found,2);
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,0);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.claim_cod_sms_chunk($1)',[actorId]), /permission denied/);
    await assert.rejects(db.query('select * from cod_sms_private.dispatch_cases'), /permission denied/);
    await db.exec('set role service_role');
    await assert.rejects(db.query('select * from cod_sms_private.dispatch_cases'), /permission denied/);
    assert.equal((await db.query('select public.claim_cod_sms_dispatch($1) claimed',[actorId])).rows[0].claimed,false);
  } finally { await db.close(); }
});

test('chunk resume freezes keys, preserves one run, updates counts immediately and finishes partial', async () => {
  const db = await fixture();
  try {
    const s = await start(db);
    assert.ok(s.token); assert.equal(s.config.reasoningEffort,'max');
    assert.equal((await db.query('select public.claim_cod_sms_chunk($1) token',[s.id])).rows[0].token,null);
    await item(db,s.runId,'A','scored'); await item(db,s.runId,'A','scored');
    let r=(await db.query('select * from public.cod_suspicion_sms_runs where id=$1',[s.runId])).rows[0];
    assert.equal(r.status,'running'); assert.equal(r.scored,1); assert.equal(r.found,2);
    const first = (await db.query('select public.finish_cod_sms_chunk($1,$2,null) result',[s.id,s.token])).rows[0].result;
    assert.equal(first.continuing,true); assert.equal(first.totals.scored,1);
    await db.exec(`reset role; delete from public.kas_cod_suspicion_data; set role service_role;`);
    const token=(await db.query('select public.claim_cod_sms_chunk($1) token',[s.id])).rows[0].token;
    const next=(await db.query('select public.prepare_cod_sms_chunk($1,$2,$3) data',[s.id,token,{...config,model:'different'}])).rows[0].data;
    assert.equal(next.runId,s.runId); assert.equal(next.config.model,config.model);
    const remaining=(await db.query('select public.next_cod_sms_cases($1,$2) cases',[s.id,token])).rows[0].cases;
    assert.deepEqual(remaining.map(x=>x.orderCode),['B']);
    await assert.rejects(db.query('select public.finish_cod_sms_chunk($1,$2,null)',[s.id,s.token]),/LEASE_LOST/);
    await item(db,s.runId,'B','failed');
    const done=(await db.query('select public.finish_cod_sms_chunk($1,$2,null) result',[s.id,token])).rows[0].result;
    assert.equal(done.status,'partial'); assert.equal(done.continuing,false); assert.equal(done.totals.failed,1);
    r=(await db.query('select * from public.cod_suspicion_sms_runs where id=$1',[s.runId])).rows[0];
    assert.equal(r.status,'partial'); assert.ok(r.finished_at); assert.equal(r.claimed,2);
    assert.equal((await db.query('select public.claim_cod_sms_chunk($1) token',[s.id])).rows[0].token,null);
  } finally { await db.close(); }
});

test('crashed lease can be reclaimed; periodic delivery is bounded and respects pause', async () => {
  const db=await fixture();
  try {
    const s=await start(db);
    await db.exec(`reset role; update public.cod_sms_schedule_dispatches set last_dispatched_at=now()-interval '7 minutes';
      select cod_sms_private.resume_dispatches();`);
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,0);
    await db.exec(`update public.cod_sms_schedule_dispatches set lease_until=now()-interval '1 second';
      select cod_sms_private.resume_dispatches(); select cod_sms_private.resume_dispatches();`);
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,1);
    await db.exec('set role service_role');
    const token=(await db.query('select public.claim_cod_sms_chunk($1) token',[s.id])).rows[0].token;
    assert.notEqual(token,s.token);
    await assert.rejects(db.query('select public.next_cod_sms_cases($1,$2)',[s.id,s.token]),/LEASE_LOST/);
    await db.query('select public.finish_cod_sms_chunk($1,$2,null)',[s.id,token]);
    await db.exec(`reset role; update public.cod_sms_schedule set enabled=false;
      update public.cod_sms_schedule_dispatches set last_dispatched_at=now()-interval '2 minutes';
      select cod_sms_private.resume_dispatches();`);
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,1);
    await db.exec('set role service_role');
    assert.equal((await db.query('select public.claim_cod_sms_chunk($1) token',[s.id])).rows[0].token,null);
  } finally { await db.close(); }
});

test('three infrastructure failures close the batch without erasing committed item counts', async()=>{
  const db=await fixture();
  try {
    const s=await start(db); await item(db,s.runId,'A','no_evidence');
    let token=s.token;
    for(let n=0;n<3;n++) {
      const result=(await db.query('select public.finish_cod_sms_chunk($1,$2,$3) result',[s.id,token,'COD_SMS_DB_FAILED'])).rows[0].result;
      assert.equal(result.status,n<2?'queued':'failed'); assert.equal(result.totals.noEvidence,1);
      if(n<2) token=(await db.query('select public.claim_cod_sms_chunk($1) token',[s.id])).rows[0].token;
    }
    const r=(await db.query('select * from public.cod_suspicion_sms_runs where id=$1',[s.runId])).rows[0];
    assert.equal(r.status,'failed'); assert.equal(r.no_evidence,1);
  } finally { await db.close(); }
});

test('schedule reports a continuing batch after ten minutes and closes an expired day without re-running it',async()=>{
  const db=await fixture();
  try{
    const s=await start(db);
    await db.exec(`reset role; update public.cod_sms_schedule_dispatches set created_at=now()-interval '20 minutes';
      select cod_sms_private.reconcile_runs();`);
    await db.query(`select set_config('test.actor',$1,false),set_config('test.dev','true',false)`,[actorId]);
    await db.exec('set role authenticated');
    const current=(await db.query('select public.get_cod_sms_schedule() data')).rows[0].data;
    assert.equal(current.lastRun.status,'running');
    await db.exec(`reset role; update public.cod_sms_schedule_dispatches set created_at=now()-interval '25 hours';
      update public.cod_suspicion_sms_runs set started_at=now()-interval '25 hours',last_progress_at=now()-interval '25 hours'
      where id<>'${actorId}'; select cod_sms_private.reconcile_runs();`);
    assert.equal((await db.query('select status from public.cod_suspicion_sms_runs where id=$1',[s.runId])).rows[0].status,'aborted');
    assert.equal((await db.query('select status from public.cod_sms_schedule_dispatches where id=$1',[s.id])).rows[0].status,'timed_out');
    await db.exec('select cod_sms_private.resume_dispatches()');
    assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,0);
  }finally{await db.close();}
});
