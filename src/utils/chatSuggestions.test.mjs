import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDynamicSuggestions,
  getFallbackSuggestions,
  FALLBACK_SUGGESTIONS
} from './chatSuggestions.js';

test('getFallbackSuggestions returns safe static suggestions for all valid tabs', () => {
  for (const tab of ['report1', 'report5', 'report3', 'report-insight']) {
    const s = getFallbackSuggestions(tab);
    assert.ok(s.placeholder.length > 0);
    assert.equal(s.suggestions.length, 3);
    assert.equal(typeof s.placeholder, 'string');
  }
  // Unknown tab falls back to report1
  assert.deepEqual(getFallbackSuggestions('unknown_tab'), FALLBACK_SUGGESTIONS.report1);
});

test('buildDynamicSuggestions generates tab-tailored questions and placeholders', () => {
  const r1 = buildDynamicSuggestions({ activeTab: 'report1', client: 'SPB', seed: 0 });
  assert.ok(r1.placeholder.includes('SPB'));
  assert.equal(r1.suggestions.length, 3);
  assert.ok(r1.suggestions.some(q => q.includes('SPB') || q.includes('ODR') || q.includes('P1ST')));

  const r5 = buildDynamicSuggestions({ activeTab: 'report5', seed: 0 });
  assert.ok(r5.placeholder.includes('ca 1') || r5.placeholder.includes('Ca 1'));
  assert.equal(r5.suggestions.length, 3);
  assert.ok(r5.suggestions.some(q => q.includes('ca 1') || q.includes('Ca 1')));

  const r3 = buildDynamicSuggestions({ activeTab: 'report3', client: 'SPE', seed: 0 });
  assert.ok(r3.placeholder.includes('Leadtime') || r3.placeholder.includes('leadtime'));
  assert.ok(r3.placeholder.includes('SPE'));
  assert.equal(r3.suggestions.length, 3);

  const ri = buildDynamicSuggestions({ activeTab: 'report-insight', seed: 0 });
  assert.ok(ri.placeholder.includes('ODR') || ri.placeholder.includes('insight') || ri.placeholder.includes('chỉ số'));
  assert.equal(ri.suggestions.length, 3);
});

test('buildDynamicSuggestions reflects region scope in suggestions', () => {
  const hcm = buildDynamicSuggestions({ activeTab: 'report1', client: 'SPB', regions: ['HCM'], seed: 1 });
  assert.ok(hcm.placeholder.includes('HCM') || hcm.suggestions.some(q => q.includes('HCM')));

  const nationwide = buildDynamicSuggestions({ activeTab: 'report1', client: 'SPB', regions: null, seed: 1 });
  assert.ok(nationwide.placeholder.includes('toàn quốc') || nationwide.suggestions.some(q => q.includes('toàn quốc')));
});

test('buildDynamicSuggestions varies questions based on seed', () => {
  const set0 = buildDynamicSuggestions({ activeTab: 'report1', client: 'SPB', seed: 0 });
  const set1 = buildDynamicSuggestions({ activeTab: 'report1', client: 'SPB', seed: 1 });
  const set2 = buildDynamicSuggestions({ activeTab: 'report1', client: 'SPB', seed: 2 });

  // At least placeholder or suggestions permutation differs between seeds
  assert.notDeepEqual(set0.suggestions, set1.suggestions);
  assert.notDeepEqual(set1.suggestions, set2.suggestions);
});
