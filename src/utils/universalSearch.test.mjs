import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCodSearchItems,
  normalizeSearchText,
  rankSearchItems
} from './universalSearch.js';

const rows = [
  {
    driver_id: 'TX-1024',
    driver_name: 'Nguyễn Văn Bình',
    order_code: 'GHN-A12345',
    suspicion_type: 'Gối đầu COD',
    warehouse_name: 'Bưu cục Tân Bình',
    total_score: 8,
    cod_amount: 250000
  },
  {
    driver_id: 'TX-1024',
    driver_name: 'Nguyễn Văn Bình',
    order_code: 'GHN-B98765',
    suspicion_type: 'Gối đầu COD',
    warehouse_name: 'Bưu cục Tân Bình',
    total_score: 6,
    cod_amount: 120000
  }
];

test('normalizeSearchText tìm được tên tiếng Việt khi gõ không dấu', () => {
  assert.equal(normalizeSearchText('Nguyễn Văn Bình'), 'nguyen van binh');
  assert.equal(normalizeSearchText('Đặng'), 'dang');
});

test('buildCodSearchItems tạo kết quả tài xế và từng mã đơn', () => {
  const { driverItems, orderItems } = buildCodSearchItems(rows);

  assert.equal(driverItems.length, 1);
  assert.equal(driverItems[0].target.driverId, 'TX-1024');
  assert.match(driverItems[0].description, /2 đơn/);
  assert.equal(orderItems.length, 2);
  assert.equal(orderItems[0].target.orderCode, 'GHN-A12345');
});

test('rankSearchItems ưu tiên mã đơn chính xác và hỗ trợ tìm tên không dấu', () => {
  const { driverItems, orderItems } = buildCodSearchItems(rows);
  const items = [...driverItems, ...orderItems];

  assert.equal(rankSearchItems(items, 'nguyen van binh')[0].type, 'cod-driver');
  assert.equal(rankSearchItems(items, 'GHN-A12345')[0].target.orderCode, 'GHN-A12345');
});
