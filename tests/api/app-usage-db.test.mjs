import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

test('usage SQL binds identity, rejects malformed writes, deduplicates retries and restricts reads to Dev', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(current_setting('request.jwt.claims', true),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create function public.is_dev_admin() returns boolean language sql stable as $$ select auth.jwt()->>'email' = 'dev@ghn.vn' $$;
      create function public.is_email_allowed(email text) returns boolean language sql stable as $$ select email like '%@ghn.vn' $$;
      grant usage on schema public,auth to authenticated,anon;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261016080518_app_usage.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/20261016080523_app_usage_monitor.sql',import.meta.url),'utf8'));
    const actor = async (email, id = 1) => {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({email,sub:`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`})]);
      await db.exec('set role authenticated');
    };
    const now = Date.now(), start = new Date(now - 30000).toISOString(), end = new Date(now).toISOString();
    // Use a fixed point within today's Vietnam day even when the test runs near midnight.
    const day = new Date(now + 7*3600000).toISOString().slice(0,10);
    const boundary = Date.parse(`${day}T00:00:00+07:00`);
    const safeStart = new Date(Math.max(boundary,Date.parse(start))).toISOString();
    const active = Date.parse(end)-Date.parse(safeStart);
    const session = '00000000-0000-0000-0000-000000000099';
    const write = (tab = 'home', ms = active, views = 1) => db.query('select public.record_app_usage($1,$2,$3,$4,$5,$6,$7)',[session,day,tab,safeStart,end,ms,views]);
    await actor('user@ghn.vn');
    await write(); await write(); await write('home',0,0);
    assert.equal((await db.query('select * from public.app_usage')).rows.length,0);
    await assert.rejects(db.query('select public.dev_app_usage()'),/USAGE_FORBIDDEN/);
    await assert.rejects(db.query('select public.dev_app_usage_monitor($1,$1)',[day]),/USAGE_FORBIDDEN/);
    await assert.rejects(db.query('delete from public.app_usage'),/permission denied/);
    await assert.rejects(write('invalid'),/check constraint/);
    await assert.rejects(write('home',active+100),/USAGE_INVALID/);
    await assert.rejects(write('home',0,-1),/USAGE_INVALID/);
    await write('ranking',0,1);
    const actionWrite = (questions, exports) => db.query('select public.record_app_usage($1,$2,$3,$4,$5,$6,$7,$8,$9)',[session,day,'ranking',safeStart,end,0,1,questions,exports]);
    await actionWrite(2,1); await actionWrite(2,1); await actionWrite(1,0);
    // Another account cannot overwrite the first account's session, even with its UUID.
    await actor('other@ghn.vn',2); await write('home',0,1);
    await actor('stranger@example.com',3); await assert.rejects(write(),/USAGE_FORBIDDEN/);
    await actor('dev@ghn.vn',4);
    const result = (await db.query('select public.dev_app_usage(7) as data')).rows[0].data;
    assert.equal(result.totals.users,2); assert.equal(result.totals.sessions,2);
    assert.equal(result.totals.views,3); assert.equal(result.totals.active_ms,active);
    assert.equal(result.totals.chat_questions,2); assert.equal(result.totals.exports,1);
    assert.equal(result.days.length,7); assert.equal(result.tabs.length,2);
    const user = result.users.find(r => r.email === 'user@ghn.vn');
    assert.equal(user.sessions,1); assert.deepEqual(user.tabs,['home','ranking']);
    const only = (await db.query(`select public.dev_app_usage(30,'USER@GHN.VN') as data`)).rows[0].data;
    assert.equal(only.totals.users,1); assert.equal(only.days.length,30);
    // A continuous page session crossing Vietnam midnight is one session in
    // the period, but appears in both daily buckets.
    await actor('user@ghn.vn');
    const yesterdayStart = new Date(boundary - 10000).toISOString();
    const yesterday = new Date(boundary - 1 + 7*3600000).toISOString().slice(0,10);
    await db.query('select public.record_app_usage($1,$2,$3,$4,$5,$6,$7)',[session,yesterday,'home',yesterdayStart,new Date(boundary).toISOString(),10000,1]);
    await assert.rejects(db.query('select public.record_app_usage($1,$2,$3,$4,$5,$6,$7)',[session,day,'home',safeStart,end,null,1]),/USAGE_INVALID/);
    await actor('dev@ghn.vn',4);
    const midnight = (await db.query(`select public.dev_app_usage(7,'user@ghn.vn') as data`)).rows[0].data;
    assert.equal(midnight.totals.sessions,1);
    assert.equal(midnight.days.reduce((sum,row)=>sum+row.sessions,0),2);
    assert.equal(midnight.users[0].days,2);
    const monitor = async (from=day,to=day,email='',tab='',selectedDay=null) => (await db.query('select public.dev_app_usage_monitor($1,$2,$3,$4,$5) as data',[from,to,email,tab,selectedDay])).rows[0].data;
    const daily = await monitor(yesterday,day,'','',yesterday);
    assert.equal(daily.totals.users,1);
    assert.equal(daily.users[0].email,'user@ghn.vn');
    assert.equal(daily.totals.active_ms,10000);
    // Chart context keeps both days while detail/table/KPIs filter one day.
    assert.equal(daily.days.length,2);
    assert.equal(daily.days.find(row=>row.day===day).users,2);
    const ranking = await monitor(yesterday,day,'','ranking',day);
    assert.equal(ranking.totals.users,1);
    assert.equal(ranking.totals.active_ms,0);
    assert.equal(ranking.totals.chat_questions,2);
    assert.deepEqual(ranking.users[0].tabs,['ranking']);
    assert.deepEqual(ranking.options.emails,['other@ghn.vn','user@ghn.vn']);
    assert.deepEqual(ranking.options.tabs,['home','ranking']);
    const detail = await monitor(yesterday,day,'USER@GHN.VN');
    assert.equal(detail.totals.sessions,1);
    assert.equal(detail.users[0].days,2);
    assert.equal(Date.parse(detail.users[0].first_seen_at),Date.parse(yesterdayStart));
    assert.equal(detail.sessions[0].active_ms,active+10000);
    const noData = await monitor(day,day,'other@ghn.vn','ranking');
    assert.equal(noData.totals.users,0);
    assert.equal(noData.totals.active_ms,0);
    assert.deepEqual(noData.users,[]);
    const early = new Date(boundary-3*86400000+7*3600000).toISOString().slice(0,10);
    const unknown = await monitor(early,day);
    assert.equal(unknown.days[0].tracked,false);
    assert.equal(unknown.days.at(-1).tracked,true);
    await assert.rejects(monitor(day,yesterday),/USAGE_RANGE_INVALID/);
    await assert.rejects(monitor(yesterday,day,'','home',early),/USAGE_RANGE_INVALID/);
    await assert.rejects(monitor(day,day,'','unknown'),/USAGE_TAB_INVALID/);
    const tooEarly = new Date(boundary-90*86400000+7*3600000).toISOString().slice(0,10);
    await assert.rejects(monitor(tooEarly,day),/USAGE_RANGE_INVALID/);
    await assert.rejects(db.query('select public.dev_app_usage(365)'),/USAGE_RANGE_INVALID/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select public.dev_app_usage()'),/permission denied/);
    await assert.rejects(db.query('select public.dev_app_usage_monitor($1,$1)',[day]),/permission denied/);
    await assert.rejects(write(),/permission denied/);
  } finally { await db.close(); }
});
