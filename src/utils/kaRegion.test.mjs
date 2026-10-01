import test from 'node:test';
import assert from 'node:assert/strict';
import { reassignKaRegion, getHubType } from './dataProcessor.js';

test('KA warehouse HCM moves to HCM - KA', () => {
  const [row] = reassignKaRegion([{ region: 'HCM', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA' }]);
  assert.equal(row.region, 'HCM - KA');
});

test('(HNO) LH Long Biên is tagged KA and moves to HNO - KA', () => {
  const [pick, fd] = reassignKaRegion([
    { region: 'HNO', hub: '(HNO) LH Long Biên', hub_type: 'BC' },
    { region: 'HNO', deliverywh: '(HNO) LH Long Biên', hub_type: 'BC' },
  ]);
  assert.equal(getHubType(pick), 'KA');
  assert.equal(pick.region, 'HNO - KA');
  assert.equal(getHubType(fd), 'KA');
  assert.equal(fd.region, 'HNO - KA');
});

test('KA warehouses become their own vùng whatever region the row came from', () => {
  const [lb, hcm, blank] = reassignKaRegion([
    { region: 'XBG', hub: '(HNO) LH Long Biên', hub_type: 'BC' },
    { region: 'DNB', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA' },
    { region: '', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA' },
  ]);
  assert.equal(getHubType(lb), 'KA');
  assert.equal(lb.region, 'HNO - KA');
  assert.equal(hcm.region, 'HCM - KA');
  assert.equal(blank.region, 'HCM - KA');
});

test('other Long Biên post offices are untouched', () => {
  const input = { region: 'HNO', hub: 'Bưu Cục 60 Sài Đồng-Q.Long Biên-Hà Nội', hub_type: 'BC' };
  const [row] = reassignKaRegion([input]);
  assert.equal(row, input);
});

test('CK hubs are tagged hub type CK by name or wh_id, vùng untouched', () => {
  const [byName, byId, byIdStr, fd, other, ka] = reassignKaRegion([
    { region: 'HCM', hub: 'BC CK Thủ Đức', hub_type: 'BC' },
    { region: 'HNO', hub: 'BC Cầu Giấy', hub_type: 'BC', wh_id: 23119000 },
    { region: 'HNO', hub: 'BC Đống Đa', hub_type: 'DC', wh_id: ' 2533 ' },
    { region: 'DNB', deliverywh: 'Kho X', hub_type: 'BC', wh_id: '22962001' },
    { region: 'HCM', hub: 'BC Q1', hub_type: 'BC', wh_id: '999' },
    { region: 'HCM', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA', wh_id: '23119000' },
  ]);
  assert.equal(getHubType(byName), 'CK');
  assert.equal(byName.region, 'HCM');
  assert.equal(getHubType(byId), 'CK');
  assert.equal(getHubType(byIdStr), 'CK');
  assert.equal(getHubType(fd), 'CK');
  assert.equal(getHubType(other), 'BC');
  assert.equal(getHubType(ka), 'KA');
});
