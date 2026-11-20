import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReverseReportModel } from './reverseReportClient.js';

test('empty payload yields no tables and no backlog (shown as real empty states)', () => {
  const model = buildReverseReportModel({ history: { columns: [], rows: [] }, backlog: { columns: [], rows: [] } });
  assert.equal(model.tables, null);
  assert.equal(model.backlog, null);
});

test('history payload builds the % PUD / vol tables', () => {
  const columns = ['report_date', 'region', 'hub', 'hub_type', 'client_name', 'mau_pu', 'pud', 'wh_id'];
  const model = buildReverseReportModel({
    history: { columns, rows: [['2026-11-19', 'HCM', 'Kho A', 'BC KD', 'SPE Reverse', 10, 8, '1']] },
    backlog: { columns: [], rows: [] }
  });
  assert.deepEqual(model.tables.dates, ['2026-11-19']);
  assert.deepEqual(model.tables.sections.map(s => s.key), ['partner', 'province', 'region']);
  assert.equal(model.backlog, null);
});
