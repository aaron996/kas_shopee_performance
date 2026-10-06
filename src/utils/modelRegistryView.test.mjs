import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRegistryModels } from './modelRegistryView.js';
const make = (id, price, extra = {}) => ({ id, revision: 2, tested_revision: 2, enabled: false, chat_candidate: true, definition: { label: id, pricing: { inputNanoUsdPerToken: price, cachedInputNanoUsdPerToken: price, outputNanoUsdPerToken: price } }, ...extra });
const models = [make('Zeta', null, { available: false }), make('Beta', 100, { enabled: true, available: true }), make('Alpha', 0, { tested_revision: 1, probe_success: false, available: null })];
test('registry filters combine status, price, availability and search without changing data', () => {
  assert.deepEqual(selectRegistryModels(models, { status: 'enabled', price: 'complete', availability: 'available', search: ' beta ' }).map(r => r.id), ['Beta']);
  assert.deepEqual(selectRegistryModels(models, { status: 'failed', availability: 'unknown' }).map(r => r.id), ['Alpha']);
  assert.deepEqual(selectRegistryModels(models, { price: 'missing' }).map(r => r.id), ['Zeta']);
  assert.equal(selectRegistryModels(models, { status: 'untested' }).length, 0);
  assert.equal(selectRegistryModels([make('New', 100, { tested_revision: 1 })], { status: 'untested' }).length, 1);
  assert.deepEqual(models.map(r => r.id), ['Zeta', 'Beta', 'Alpha']);
});
test('unknown prices sort last in both directions and zero remains a known price', () => {
  assert.deepEqual(selectRegistryModels(models, { sort: 'input-asc' }).map(r => r.id), ['Alpha', 'Beta', 'Zeta']);
  assert.deepEqual(selectRegistryModels(models, { sort: 'output-desc' }).map(r => r.id), ['Beta', 'Alpha', 'Zeta']);
  assert.deepEqual(selectRegistryModels(models, { sort: 'name-desc' }).map(r => r.id), ['Zeta', 'Beta', 'Alpha']);
});
test('non-chat inventory remains discoverable through the all-model switch', () => {
  const image = make('image-only', 50, { chat_candidate: false });
  assert.equal(selectRegistryModels([image]).length, 0);
  assert.equal(selectRegistryModels([image], { showAll: true }).length, 1);
});
