import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshotParams, unpackRows, scopeSnapshotRows, SNAPSHOT_VIEWS } from './snapshotView.js';

test('parses the n8n report/table names into a dashboard view', () => {
  const parsed = parseSnapshotParams('?report=pick&table=opr&client=spb&token=t&excludeHubTypes=Ahamove, GXT');
  assert.deepEqual(parsed.view, SNAPSHOT_VIEWS['pick:opr']);
  assert.equal(parsed.client, 'SPB');
  assert.deepEqual(parsed.excludeHubTypes, ['Ahamove', 'GXT']);

  assert.equal(parseSnapshotParams('?report=ca1&table=cross_metro_star&token=t').view.lane, 'Cross Metro*');
  assert.equal(parseSnapshotParams('?report=fd&token=t').view.metric, 'fd');
});

test('rejects unknown tables, clients and a missing token', () => {
  assert.ok(parseSnapshotParams('?report=pick&table=xyz&token=t').error);
  assert.ok(parseSnapshotParams('?report=pick&table=1st&client=ALL&token=t').error);
  assert.ok(parseSnapshotParams('?report=pick&table=1st').error);
});

test('unpackRows rebuilds row objects', () => {
  assert.deepEqual(
    unpackRows({ columns: ['region', 'mau_pu'], rows: [['HCM', 3], ['HNO', null]] }),
    [{ region: 'HCM', mau_pu: 3 }, { region: 'HNO', mau_pu: null }]
  );
  assert.deepEqual(unpackRows(null), []);
});

test('scopeSnapshotRows moves KA hubs into their vùng and drops excluded hub types', () => {
  const { rows, isHubTypeFiltered } = scopeSnapshotRows([
    { region: 'HCM', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA' },
    { region: 'HNO', hub: '(HNO) LH Long Biên', hub_type: 'BC' },
    { region: 'HCM', hub: 'Ahamove HCM', hub_type: 'Ahamove' },
    { region: 'HCM', hub: 'BC Q1', hub_type: 'BC' },
    { region: 'Không rõ', hub: 'X', hub_type: 'BC' }
  ], SNAPSHOT_VIEWS['pick:1st'], ['ahamove']);

  assert.deepEqual(rows.map(r => r.region), ['HCM - KA', 'HNO - KA', 'HCM']);
  assert.equal(isHubTypeFiltered, true);
});

test('scopeSnapshotRows filters Ca1 on vung_giao and keeps every hub type by default', () => {
  const { rows, isHubTypeFiltered } = scopeSnapshotRows([
    { vung_giao: 'HCM', lane: 'Intra city', hub_type: 'BC' },
    { vung_giao: 'Không rõ', lane: 'Intra city', hub_type: 'BC' }
  ], SNAPSHOT_VIEWS['ca1:intra_city']);
  assert.equal(rows.length, 1);
  assert.equal(isHubTypeFiltered, false);
});

test('hubTypes keeps only those hub types (CK-only pictures), CK split from BC', () => {
  assert.deepEqual(parseSnapshotParams('?report=pick&table=1st&token=t&hubTypes=ck').onlyHubTypes, ['ck']);
  const { rows, isHubTypeFiltered } = scopeSnapshotRows([
    { region: 'HCM', hub: 'BC CK Thủ Đức', hub_type: 'BC' },
    { region: 'HCM', hub: 'BC Q1', hub_type: 'BC', wh_id: '22490000' },
    { region: 'HCM', hub: 'BC Q2', hub_type: 'BC', wh_id: '1' }
  ], SNAPSHOT_VIEWS['pick:1st'], [], ['CK']);
  assert.deepEqual(rows.map(r => r.hub), ['BC CK Thủ Đức', 'BC Q1']);
  assert.equal(isHubTypeFiltered, true);
});
