import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDrivers } from './drivers.js';
import { executeChatTool } from './tools.js';

const total = (volume, ontime) => ({ volume, ontime });

test('contributions sum to the total change in percentage points', () => {
  const previousRows = [{ entity: 'A', volume: 600, ontime: 570 }, { entity: 'B', volume: 400, ontime: 380 }];
  const currentRows = [{ entity: 'A', volume: 500, ontime: 430 }, { entity: 'B', volume: 400, ontime: 380 }];
  const out = computeDrivers({ previous: total(1000, 950), current: total(900, 810), previousRows, currentRows });
  assert.equal(out.ratePrevious, 95);
  assert.equal(out.rateCurrent, 90);
  assert.equal(out.changePp, -5);
  assert.equal(out.drivers[0].entity, 'A');
  const sum = out.drivers.reduce((s, d) => s + d.contributionPp, 0);
  assert.ok(Math.abs(sum - out.changePp) < 0.02);
  assert.ok(out.drivers[0].rateEffectPp < 0);
});

test('returns null when a period has no volume', () => {
  assert.equal(computeDrivers({ previous: total(0, 0), current: total(10, 9), previousRows: [], currentRows: [] }), null);
});

test('get_metric_change_drivers rejects overlapping periods and reads sequentially', async () => {
  const args = { metric: 'd1st', client: 'SPB', current_from: '2026-11-05', current_to: '2026-11-05',
    previous_from: '2026-11-04', previous_to: '2026-11-04', grain: 'hub', regions: [], hub_types: [] };
  const calls = [];
  const userClient = { rpc: async (name, params) => {
    calls.push(params);
    const cur = params.p_date_from === '2026-11-05';
    if (params.p_grain === 'nationwide') return { data: { rows: [cur ? { volume: 100, ontime: 90 } : { volume: 100, ontime: 95 }] } };
    return { data: { totalEntities: 1, rows: [cur ? { entity: 'H1', volume: 100, ontime: 90 } : { entity: 'H1', volume: 100, ontime: 95 }] } };
  } };
  const result = await executeChatTool({ name: 'get_metric_change_drivers', arguments: args }, { userClient });
  assert.equal(result.data.analysis.changePp, -5);
  assert.equal(result.data.analysis.drivers[0].entity, 'H1');
  assert.equal(result.data.partial, false);
  assert.ok(calls.every(call => 'p_offset' in call));
  await assert.rejects(executeChatTool({ name: 'get_metric_change_drivers',
    arguments: { ...args, previous_to: '2026-11-05' } }, { userClient }), { code: 'CHAT_TOOL_ARGUMENTS_INVALID' });
});
