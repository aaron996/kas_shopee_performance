import test from 'node:test';
import assert from 'node:assert/strict';
import { reassignKaRegion, reassignGxtMienRegion, normalizeDashboardRows, getHubType } from './dataProcessor.js';
import { mienFromHubName } from '../data/provinceMien.js';

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

test('CK hubs are tagged hub type CK by name or wh_id; HCM / HNO ones move to their CK vùng', () => {
  const [byName, byId, byIdStr, fd, other, ka] = reassignKaRegion([
    { region: 'HCM', hub: 'BC CK Thủ Đức', hub_type: 'BC' },
    { region: 'HNO', hub: 'BC Cầu Giấy', hub_type: 'BC', wh_id: 23119000 },
    { region: 'HNO', hub: 'BC Đống Đa', hub_type: 'DC', wh_id: ' 2533 ' },
    { region: 'DNB', deliverywh: 'Kho X', hub_type: 'BC', wh_id: '22962001' },
    { region: 'HCM', hub: 'BC Q1', hub_type: 'BC', wh_id: '999' },
    { region: 'HCM', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA', wh_id: '23119000' },
  ]);
  assert.equal(getHubType(byName), 'CK');
  assert.equal(byName.region, 'HCM - CK');
  assert.equal(byId.region, 'HNO - CK');
  assert.equal(fd.region, 'DNB');
  assert.equal(other.region, 'HCM');
  assert.equal(ka.region, 'HCM - KA');
  assert.equal(getHubType(byId), 'CK');
  assert.equal(getHubType(byIdStr), 'CK');
  assert.equal(getHubType(fd), 'CK');
  assert.equal(getHubType(other), 'BC');
  assert.equal(getHubType(ka), 'KA');
});

const gxt = (region, hub, extra = {}) => ({ region, hub, hub_type: 'GXT', ...extra });

test('GXT hubs get one vùng per Miền, decided by the province at the end of the hub name', () => {
  const rows = reassignGxtMienRegion([
    gxt('HCM - GXT', 'Kho Giao Hàng Nặng - Độc Lập - HCM'),
    gxt('DNB', 'Kho Giao Hàng Nặng - Long Thành - Đồng Nai'),
    gxt('DSH', 'Kho Giao Hàng Nặng - Ân Thi - Hưng Yên'),
    gxt('XBG', 'Kho Giao Hàng Nặng - An Dương - Hải Phòng'),
    gxt('TTB', 'Kho Giao Hàng Nặng - Liên Chiểu - Đà Nẵng'),
    gxt('TNG', 'Kho Giao Hàng Nặng - Buôn Ma Thuột - Đắk Lắk'),
    gxt('DNB', 'Kho Giao Hàng Nặng - Hồ Chí Minh'),
  ]);
  assert.deepEqual(rows.map(r => r.region), ['GXT - Nam', 'GXT - Nam', 'GXT - Bắc', 'GXT - Bắc', 'GXT - Trung', 'GXT - Trung', 'GXT - Nam']);
  assert.ok(rows.every(r => getHubType(r) === 'GXT'));
});

test("the raw region of a GXT row is the order's region, so the hub name decides the Miền", () => {
  // The same HCM hub appears under DSH, HNO and TTB in the source.
  const rows = reassignGxtMienRegion(['DSH', 'HNO', 'TTB', ''].map(region => gxt(region, 'Kho Giao Hàng Nặng - Tân Tạo - HCM')));
  assert.deepEqual(rows.map(r => r.region), Array(4).fill('GXT - Nam'));
});

test('a GXT hub with an unrecognised province falls back to its region; with neither it is left alone', () => {
  const [byRegion, byLegacy, unknown] = reassignGxtMienRegion([
    gxt('TTB', 'Kho Giao Hàng Nặng - Somewhere'),
    gxt('HCM - GXT', 'Kho Giao Hàng Nặng - Somewhere'),
    gxt('', 'Kho Giao Hàng Nặng - Somewhere'),
  ]);
  assert.equal(byRegion.region, 'GXT - Trung');
  assert.equal(byLegacy.region, 'GXT - Nam');
  assert.equal(unknown.region, '');
});

test('only GXT rows move: other hub types and KA / CK hubs keep their vùng', () => {
  const rows = normalizeDashboardRows([
    { region: 'HNO', hub: 'BC Cầu Giấy - Hà Nội', hub_type: 'BC' },
    { region: 'HCM', hub: 'Key Account Warehouse Ho Chi Minh', hub_type: 'KA' },
    { region: 'HCM', hub: 'BC CK Thủ Đức - HCM', hub_type: 'BC' },
    gxt('HCM', 'Kho Giao Hàng Nặng - Thủ Đức - HCM'),
  ]);
  assert.deepEqual(rows.map(r => r.region), ['HNO', 'HCM - KA', 'HCM - CK', 'GXT - Nam']);
});

test('province lookup matches whole words at the end of the name, accents and "đ" aside', () => {
  assert.equal(mienFromHubName('Kho Giao Hàng Nặng - TP Vị Thanh - Hậu Giang'), 'Miền Nam');
  assert.equal(mienFromHubName('Kho Giao Hang Nang - Gia Nghia - Dak Nong'), 'Miền Trung');
  assert.equal(mienFromHubName('Kho X - Mỹ Lộc - Nam Định'), 'Miền Bắc');
  assert.equal(mienFromHubName('Kho X - Bà Rịa - Vũng Tàu'), 'Miền Nam');
  assert.equal(mienFromHubName('Kho Giao Hàng Nặng - TP Vũng Tàu - BRVT'), 'Miền Nam');
  assert.equal(mienFromHubName('Kho Giao Hàng Nặng - Cam Ranh - Khánh Hoà'), 'Miền Trung');
  assert.equal(mienFromHubName('Kho Giao Hàng Nặng - HCMC Depot'), null);
  assert.equal(mienFromHubName(''), null);
});
