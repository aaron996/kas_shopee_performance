import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDashboardRows, getHubType, isKhlWarehouse, canonicalHubType } from './dataProcessor.js';

test('KHL is decided by warehouse id (or name when there is no id) for every client, whatever label BI sends', () => {
  const rows = [
    { client_name: 'SPE Reverse', region: 'HCM', hub: '(HCM) LH Củ Chi', hub_type: 'BC', wh_id: '23142001' },
    { client_name: 'SPE', region: 'HCM', hub: '(LAN) LH Đức Lập', hub_type: 'BC', wh_id: 23142000 },
    { client_name: 'SPB', region: 'HNO', hub: 'Bất kỳ', hub_type: 'KA', wh_id: '' },
    { client_name: 'SPB', region: 'HCM', hub: '(HCM) ĐL Nhuận Đức', hub_type: 'BC' },
    { client_name: 'SPE', region: 'HCM', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA', wh_id: '1327' },
    { client_name: 'SPE Reverse', region: 'HNO', hub: '(HNO) LH Long Biên', hub_type: 'KA', wh_id: '23013000' },
    { client_name: 'SPE', region: 'HNO', hub: '(HNO) KD Đông Anh', hub_type: 'BC KD', wh_id: '1' },
    { client_name: 'SPE', region: 'HNO', hub: 'Hub thường', hub_type: 'BC', wh_id: '22370000' }
  ];
  assert.deepEqual(normalizeDashboardRows(rows).map(getHubType), ['KHL', 'KHL', 'KHL', 'KHL', 'KHL', 'KHL', 'BC KD', 'BC']);
});

test('an id wins over a name; a wrong id is not rescued by the name', () => {
  assert.equal(isKhlWarehouse({ wh_id: '999', hub: '(HCM) LH Củ Chi' }), false);
  assert.equal(isKhlWarehouse({ wh_id: '23142003' }), true);
  assert.equal(isKhlWarehouse({ hub: ' (HCM) ĐL Xuân Thới Sơn 1 ' }), true);
  assert.equal(isKhlWarehouse({}), false);
});

test('BI backlog abbreviations map to the filter names', () => {
  assert.deepEqual(['KD', 'ahm', 'KA', 'KHL', 'BC', 'GXT', '', null].map(canonicalHubType), ['BC KD', 'Ahamove', 'KHL', 'KHL', 'BC', 'GXT', '', '']);
});
