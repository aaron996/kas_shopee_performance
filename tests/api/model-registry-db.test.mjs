import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('registry SQL protects writes, preserves sync definitions, requires current probe/prices and blocks disabling in-use model', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.ai_chat_model_config(feature text, model text, reasoning_effort text);
      grant select,insert,update,delete on public.ai_chat_model_config to service_role;`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261006120000_ai_model_registry.sql', import.meta.url), 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.ai_model_registry'), /permission denied/);
      await assert.rejects(db.query(`select public.sync_ai_model_registry('[{"id":"gpt-new"}]','attacker')`), /permission denied/);
      await assert.rejects(db.query(`select public.toggle_ai_model_registry('gpt-4.1',1,false,'attacker')`), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const sync = [{ id: 'gpt-new', chatCandidate: true }, { id: 'image-new', chatCandidate: false }];
    await db.query('select public.sync_ai_model_registry($1,$2)', [JSON.stringify(sync), 'cron']);
    assert.equal((await db.query(`select enabled from public.ai_model_registry where id='gpt-new'`)).rows[0].enabled, false);
    const definition = { id: 'gpt-new', label: 'New model', reasoningEfforts: ['low'], defaultReasoningEffort: 'low', pricing: { inputNanoUsdPerToken: 100, cachedInputNanoUsdPerToken: 10, outputNanoUsdPerToken: 200 } };
    await db.query('select public.save_ai_model_definition($1,1,$2)', [JSON.stringify(definition), 'dev']);
    await assert.rejects(db.query(`select public.toggle_ai_model_registry('gpt-new',2,true,'dev')`), /MODEL_PROBE_REQUIRED/);
    await assert.rejects(db.query(`select public.record_ai_model_probe('gpt-new',1,true,'dev')`), /MODEL_STALE/);
    await db.query(`select public.record_ai_model_probe('gpt-new',2,true,'dev')`);
    await db.query(`select public.toggle_ai_model_registry('gpt-new',2,true,'dev')`);
    await assert.rejects(db.query('select public.save_ai_model_definition($1,2,$2)', [JSON.stringify({ ...definition, label: 'Changed' }), 'dev']), /MODEL_DISABLE_BEFORE_EDIT/);
    await db.query(`insert into public.ai_chat_model_config values('chat','gpt-new','low')`);
    await assert.rejects(db.query(`select public.toggle_ai_model_registry('gpt-new',2,false,'dev')`), /MODEL_IN_USE/);
    await assert.rejects(db.query(`insert into public.ai_chat_model_config values('chat','gpt-new','high')`), /MODEL_REASONING_INVALID/);
    await db.query('select public.sync_ai_model_registry($1,$2)', [JSON.stringify(sync), 'cron']);
    const row = (await db.query(`select * from public.ai_model_registry where id='gpt-new'`)).rows[0];
    assert.deepEqual(row.definition, definition);
    assert.equal(row.enabled, true);
    await db.query(`delete from public.ai_chat_model_config`);
    await db.query(`select public.toggle_ai_model_registry('gpt-new',2,false,'dev')`);
    await db.query('select public.save_ai_model_definition($1,2,$2)', [JSON.stringify({ ...definition, pricing: {} }), 'dev']);
    await db.query(`select public.record_ai_model_probe('gpt-new',3,true,'dev')`);
    await assert.rejects(db.query(`select public.toggle_ai_model_registry('gpt-new',3,true,'dev')`), /MODEL_PRICE_REQUIRED/);
    assert.ok((await db.query('select * from public.ai_model_registry_audit')).rows.length >= 6);
  } finally { await db.close(); }
});
