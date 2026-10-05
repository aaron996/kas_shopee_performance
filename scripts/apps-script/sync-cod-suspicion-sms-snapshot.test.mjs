import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('./sync-cod-suspicion-sms-snapshot.gs', import.meta.url), 'utf8');

function harness(priorityHeader, priorityValue) {
  const requests = [];
  let values;
  const spreadsheet = {
    getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
    getSheetByName: () => ({
      getDataRange: () => ({
        getValues: () => values,
        getDisplayValues: () => values.map(row => row.map(String))
      })
    })
  };
  const context = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    Logger: { log() {} },
    Utilities: { formatDate: () => '20261005_160000' },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => 'test-only-key' })
    },
    UrlFetchApp: {
      fetch(url, options) {
        requests.push({ url, payload: JSON.parse(options.payload) });
        return { getResponseCode: () => 200, getContentText: () => '{"success":true}' };
      }
    }
  });
  vm.runInContext(script, context);
  // Move the priority column away from AK to verify name-based mapping.
  const headers = [priorityHeader, ...vm.runInContext('COD_SMS_REQUIRED_HEADERS', context)
    .filter(header => header !== 'Mức nghi ngờ')];
  const source = {
    'Loại nghi ngờ': 'Gối đầu COD',
    'ID tài xế': 'D1',
    'Mã đơn': 'O1',
    'Trạng thái hiện tại': 'delivered',
    'COD': 1500000,
    'Điểm tổng nghi vấn': 33,
    'SMS - thời gian': '2026-10-05 12:00:00',
    'SMS - loại người nhận': 'buyer',
    'SMS - nội dung': 'Em nhận hàng rồi anh'
  };
  const row = headers.map(header => header === priorityHeader ? priorityValue : source[header] ?? '');
  values = [headers, row, [...row]];
  return { context, requests };
}

for (const header of ['Mức nghi ngờ', 'Mức ưu tiên xử lý', 'Mức ưu tiên gọi xác minh', '  MỨC   NGHI NGỜ  ']) {
  for (const priority of ['Cao', 'Trung bình', 'Thấp']) {
    test(`sync ${header} = ${priority}: map priority and deduplicate SMS`, () => {
      const { context, requests } = harness(header, priority);
      vm.runInContext('syncGoiDauCodSmsSnapshot()', context);
      assert.equal(requests.length, 1);
      const { orders, sms_messages: sms, snapshot_meta: meta } = requests[0].payload;
      assert.equal(orders.length, 1);
      assert.equal(orders[0].call_verification_priority, priority);
      assert.equal(orders[0].total_score, 33);
      assert.equal(orders[0].cod_amount, 1500000);
      assert.equal(sms.length, 1);
      assert.equal(sms[0].order_code, orders[0].order_code);
      assert.equal(meta.source_rows, 2);
    });
  }
}

for (const [header, value, error] of [
  ['Unknown priority', 'Cao', /Thiếu header bắt buộc: Mức nghi ngờ/],
  ['Mức nghi ngờ', 'Rất cao', /Mức nghi ngờ không hợp lệ/]
]) {
  test(`invalid header/value stops before Supabase: ${header} = ${value}`, () => {
    const { context, requests } = harness(header, value);
    assert.throws(() => vm.runInContext('syncGoiDauCodSmsSnapshot()', context), error);
    assert.equal(requests.length, 0);
  });
}
