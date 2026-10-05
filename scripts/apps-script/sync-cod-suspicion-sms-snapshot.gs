/**
 * Đồng bộ tab `goi_dau_COD` theo snapshot có SMS.
 *
 * Nguồn SQLLab có grain 1 dòng / SMS, trong khi bảng đơn COD phải có grain
 * 1 dòng / đơn. Script này aggregate trước khi gọi Supabase:
 *   - orders: 1 dòng / (suspicion_type, driver_id, order_code)
 *   - sms_messages: nhiều dòng / đơn, đã bỏ SMS trùng hoàn toàn
 *
 * Yêu cầu trước khi chạy production:
 *   1. Áp dụng migration tạo RPC `sync_kas_cod_suspicion_snapshot` (bản mới nhất
 *      là 20260929082541_cod_suspicion_warehouse_id, có cột warehouse_id).
 *   2. Đặt Script Property `SUPABASE_SERVICE_ROLE_KEY`.
 *   3. Không để nhánh COD cũ trong `sync-to-supabase.gs` chạy cùng snapshot.
 *
 * Không hard-code service role key. Hãy chạy `dryRunGoiDauCodSmsSnapshot()`
 * trước để đối chiếu counts, rồi mới chạy `syncGoiDauCodSmsSnapshot()`.
 */

const COD_SMS_SUPABASE_URL = 'https://iyjsihwgnzcytbojvoom.supabase.co';
const COD_SMS_SHEET_NAME = 'goi_dau_COD';
const COD_SMS_CONFLICTS_SHEET_NAME = 'goi_dau_COD_conflicts';
const COD_SMS_RPC_NAME = 'sync_kas_cod_suspicion_snapshot';
const COD_SMS_TRIGGER_HOUR = 8;
const COD_SMS_TRIGGER_MINUTE = 45;
const COD_SMS_CONFLICTS_HEADERS = [
  'Thời gian chạy', 'Batch ID', 'Loại nghi ngờ', 'ID tài xế', 'Mã đơn',
  'Dòng sheet gây lệch', 'Cột lệch'
];

// Required deliberately includes every source column currently used for
// operations/audit or for the SMS scoring pipeline. A renamed/dropped BI alias
// stops the refresh before it can replace a good snapshot with partial data.
const COD_SMS_REQUIRED_HEADERS = [
  'Loại nghi ngờ', 'ID tài xế', 'Tên tài xế', 'Trạng thái tài xế',
  'Mã đơn', 'Trạng thái hiện tại', 'COD', 'ID kho giao', 'Kho giao',
  'To province', 'Ngày gán giao', 'Ngày kết thúc giao', 'Ngày chuyển hoàn',
  'Tổng thời gian giao (ngày)', 'Số ngày hẹn giao lại',
  'Bất thường call log (so P90 hardcode)', 'Số cuộc gọi có người nghe',
  'Lý do fail ca giao đầu tiên', 'Thiếu dữ liệu order_fail_reason (M14)',
  'Mâu thuẫn lý do vs duration (M7)', 'Số ngày cách ca thử giao tiếp theo',
  'Hẹn lại nhưng cách >=2 ngày (M8)', 'Call log giả từ lần thử 2 (M9)',
  'Khoảng cách GPS lúc thành công (km)', 'GPS bất thường lúc thành công (M10)',
  'GPS trùng khớp giữa nhiều đơn (M11)', 'GPS mocked lúc thành công (M12)',
  'Call log trùng khớp giữa nhiều đơn (M15)',
  'Nhiều đơn cùng lý do fail, cập nhật gần nhau (M16)', 'Điểm tổng nghi vấn',
  'TB thời lượng 1 cuộc gọi (giây)', 'TB thời lượng đổ chuông (giây)',
  'Số lượng call log (đơn này)', 'so_don_nghi_van_cua_tai_xe',
  'rn_trong_tai_xe', 'tai_xe_dat_dieu_kien', 'Mức nghi ngờ',
  'SMS - thời gian', 'SMS - loại người nhận', 'SMS - nội dung'
];

// Source is nationwide now (was HCM-only), so each order carries its
// destination province. BI has exported it as "To province" and later as
// "Tỉnh giao", so any of these spellings maps to the canonical header.
const COD_SMS_PROVINCE_HEADER = 'To province';
const COD_SMS_PROVINCE_HEADER_ALIASES = ['to province', 'to_province', 'toprovince', 'tỉnh giao'];

// The source sheet renamed its priority column (currently AK). Resolve by
// header, not position, and accept the previous SQL/export names too.
const COD_SMS_PRIORITY_HEADER = 'Mức nghi ngờ';
const COD_SMS_PRIORITY_HEADER_ALIASES = [
  'mức nghi ngờ', 'mức ưu tiên xử lý', 'mức ưu tiên gọi xác minh'
];

// BI dropped this column from the current query. Read it when present so an
// older export still fills driver_resignation_date, otherwise store null.
const COD_SMS_RESIGNATION_HEADER = 'Ngày nghỉ việc (nếu có)';

/** Build and log the exact snapshot without writing to Supabase. */
function dryRunGoiDauCodSmsSnapshot() {
  const snapshot = buildGoiDauCodSmsSnapshot_();
  Logger.log(JSON.stringify({
    source_rows: snapshot.stats.source_rows,
    total_orders: snapshot.orders.length,
    total_sms_messages: snapshot.sms_messages.length,
    orders_with_sms: snapshot.stats.orders_with_sms,
    orders_without_sms: snapshot.stats.orders_without_sms,
    duplicate_sms_removed: snapshot.stats.duplicate_sms_removed,
    total_drivers: snapshot.stats.total_drivers,
    orders_by_province: snapshot.stats.orders_by_province,
    conflicted_orders_skipped: snapshot.stats.conflicted_orders_skipped
  }));
}

/** Aggregate the sheet then atomically replace the COD + SMS snapshot. */
function syncGoiDauCodSmsSnapshot() {
  const snapshot = buildGoiDauCodSmsSnapshot_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const batchId = 'GOI_DAU_COD_SMS_' + Utilities.formatDate(
    new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmmss'
  );

  if (snapshot.stats.conflicted_orders_skipped > 0) {
    logConflictsToSheet_(ss, batchId, snapshot.stats.conflicts);
  }

  const response = callCodSmsSnapshotRpc_(snapshot.orders, snapshot.sms_messages, {
    batch_id: batchId,
    notes: 'Đồng bộ Apps Script tab goi_dau_COD, aggregate đơn và SMS',
    source_rows: snapshot.stats.source_rows,
    unique_orders: snapshot.orders.length,
    unique_sms_messages: snapshot.sms_messages.length,
    conflicted_orders_skipped: snapshot.stats.conflicted_orders_skipped
  });

  Logger.log('Đồng bộ snapshot COD + SMS thành công: ' + JSON.stringify(response));
  if (snapshot.stats.conflicted_orders_skipped > 0) {
    Logger.log(
      'LƯU Ý: ' + snapshot.stats.conflicted_orders_skipped + ' đơn KHÔNG được đồng bộ lần này vì ' +
      'dữ liệu không nhất quán trong cùng 1 lần chạy BI (khả năng cao datajob Airflow không ổn định, ' +
      'đã confirm với BI — không tự suy đoán giá trị đúng). Chi tiết đã ghi vào tab "' +
      COD_SMS_CONFLICTS_SHEET_NAME + '".'
    );
  }
}

/** Append one row per conflicted order into the dedicated log tab (creates it on first use). */
function logConflictsToSheet_(ss, batchId, conflicts) {
  let sheet = ss.getSheetByName(COD_SMS_CONFLICTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(COD_SMS_CONFLICTS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COD_SMS_CONFLICTS_HEADERS);
  }

  const runTimestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const rows = conflicts.map((conflict) => {
    const [suspicionType, driverId, orderCode] = conflict.order.split('\u001f');
    return [runTimestamp, batchId, suspicionType, driverId, orderCode, conflict.sheet_row, conflict.diff];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, COD_SMS_CONFLICTS_HEADERS.length).setValues(rows);
}

/** Recreate exactly one daily trigger for this dedicated COD+SMS path. */
function createCodSmsDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'syncGoiDauCodSmsSnapshot')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('syncGoiDauCodSmsSnapshot')
    .timeBased()
    .atHour(COD_SMS_TRIGGER_HOUR)
    .nearMinute(COD_SMS_TRIGGER_MINUTE)
    .everyDays(1)
    .inTimezone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone())
    .create();
}

function buildGoiDauCodSmsSnapshot_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(COD_SMS_SHEET_NAME);
  if (!sheet) {
    throw new Error('Không tìm thấy tab "' + COD_SMS_SHEET_NAME + '".');
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  // Rendered text of each cell, only used to show what a human sees in error
  // messages when a numeric cell can't be read (see numberOrNull_).
  const displayValues = dataRange.getDisplayValues();
  if (values.length < 2) {
    throw new Error('Tab "' + COD_SMS_SHEET_NAME + '" trống hoặc chỉ có header.');
  }

  const headers = values[0].map((header) => canonicalHeader_(String(header).trim()));
  const missingHeaders = COD_SMS_REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error('Thiếu header bắt buộc: ' + missingHeaders.join(', '));
  }

  const ordersByKey = new Map();
  const smsByKey = new Map();
  // Tab is fully overwritten each run, so a mismatch here is a genuine
  // data-quality bug in the BI query itself (e.g. a fan-out JOIN), not a
  // formatting artifact. Silently picking one of the two conflicting values
  // is unsafe (this feeds a system used for driver disciplinary decisions) —
  // instead the whole order is excluded from the snapshot and reported, so
  // one broken order doesn't block every other order from syncing.
  const conflictedKeys = new Set();
  const conflicts = [];
  const sourceRows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.some((cell) => cell !== '' && cell !== null)) {
      sourceRows.push({ row: row, displayRow: displayValues[i], sheetRowNumber: i + 1 });
    }
  }

  sourceRows.forEach((entry) => {
    const sheetRowNumber = entry.sheetRowNumber;
    const source = rowToObject_(headers, entry.row);
    const displaySource = rowToObject_(headers, entry.displayRow);
    const order = normalizeCodOrder_(source, displaySource, ss.getSpreadsheetTimeZone(), sheetRowNumber);
    const key = orderKey_(order);
    const stableCore = stableJson_(order);
    const existing = ordersByKey.get(key);

    // Every repeated source row represents another SMS for the same order. If
    // any non-SMS field diverges, this order's data is unreliable this run —
    // exclude it (see conflictedKeys comment above) instead of guessing.
    if (existing && existing.stable_core !== stableCore) {
      conflictedKeys.add(key);
      conflicts.push({
        order: key,
        sheet_row: sheetRowNumber,
        diff: diffOrderFields_(existing.order, order)
      });
    } else if (!existing) {
      ordersByKey.set(key, { order: order, stable_core: stableCore });
    }

    const sms = normalizeSmsMessage_(source, order, ss.getSpreadsheetTimeZone(), sheetRowNumber);
    if (!sms) return;
    const smsKey = key + '\u001f' + stableJson_({
      sms_time: sms.sms_time,
      recipient_type: sms.recipient_type,
      content: sms.content
    });
    smsByKey.set(smsKey, sms);
  });

  // Drop the conflicted orders entirely (not just the later duplicate row) —
  // the first-seen value is just as unverified as the one that disagreed with
  // it, and their SMS rows too, so nothing referencing an excluded order gets
  // synced.
  const orders = Array.from(ordersByKey.entries())
    .filter(([key]) => !conflictedKeys.has(key))
    .map(([, entry]) => entry.order);
  const smsMessages = Array.from(smsByKey.values())
    .filter((sms) => !conflictedKeys.has(orderKey_(sms)))
    .sort((a, b) => (
      a.order_code.localeCompare(b.order_code) ||
      String(a.sms_time || '').localeCompare(String(b.sms_time || '')) ||
      a.content.localeCompare(b.content)
    ));
  const ordersWithSms = new Set(smsMessages.map((sms) => orderKey_(sms))).size;

  if (conflicts.length > 0) {
    Logger.log(
      'CẢNH BÁO: ' + conflictedKeys.size + ' đơn bị loại khỏi snapshot do dữ liệu không nhất quán ' +
      'giữa các dòng SMS trong cùng lần chạy (khả năng cao là bug fan-out ở query BI, không phải lỗi ' +
      'định dạng) — cần báo BI kiểm tra riêng:\n' + JSON.stringify(conflicts, null, 2)
    );
  }

  return {
    orders: orders,
    sms_messages: smsMessages,
    stats: {
      source_rows: sourceRows.length,
      total_drivers: new Set(orders.map((order) => order.driver_id)).size,
      orders_by_province: countBy_(orders, (order) => order.to_province || '(trống)'),
      orders_with_sms: ordersWithSms,
      orders_without_sms: orders.length - ordersWithSms,
      duplicate_sms_removed: sourceRows.filter((entry) => !isBlank_(entry.row[headers.indexOf('SMS - nội dung')])).length - smsMessages.length,
      conflicted_orders_skipped: conflictedKeys.size,
      conflicts: conflicts
    }
  };
}

function canonicalHeader_(header) {
  const normalized = header.toLowerCase().replace(/\s+/g, ' ');
  if (COD_SMS_PRIORITY_HEADER_ALIASES.includes(normalized)) return COD_SMS_PRIORITY_HEADER;
  return COD_SMS_PROVINCE_HEADER_ALIASES.includes(normalized) ? COD_SMS_PROVINCE_HEADER : header;
}

function countBy_(items, keyFn) {
  const counts = {};
  items.forEach((item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function rowToObject_(headers, row) {
  const source = {};
  headers.forEach((header, index) => {
    source[header] = row[index];
  });
  return source;
}

function normalizeCodOrder_(source, displaySource, timezone, sheetRowNumber) {
  const required = ['Loại nghi ngờ', 'ID tài xế', 'Mã đơn', 'Trạng thái hiện tại'];
  const missing = required.filter((header) => isBlank_(source[header]));
  if (missing.length > 0) {
    throw new Error('Dòng ' + sheetRowNumber + ' thiếu: ' + missing.join(', '));
  }
  const answeredCallCount = integerOrNull_(
    source['Số cuộc gọi có người nghe'], 'Số cuộc gọi có người nghe', sheetRowNumber,
    displaySource['Số cuộc gọi có người nghe']
  );

  return {
    suspicion_type: enumText_(source['Loại nghi ngờ'], ['Gối đầu COD', 'Rút ruột'], 'Loại nghi ngờ', sheetRowNumber),
    driver_id: requiredText_(source['ID tài xế']),
    driver_name: textOrNull_(source['Tên tài xế']),
    driver_status: textOrNull_(source['Trạng thái tài xế']),
    driver_resignation_date: dateOrNull_(source[COD_SMS_RESIGNATION_HEADER], timezone, sheetRowNumber),
    order_code: requiredText_(source['Mã đơn']),
    order_status: requiredText_(source['Trạng thái hiện tại']),
    cod_amount: numberOrNull_(source['COD'], 'COD', sheetRowNumber, displaySource['COD']),
    warehouse_id: idTextOrNull_(source['ID kho giao'], 'ID kho giao', sheetRowNumber),
    warehouse_name: textOrNull_(source['Kho giao']),
    to_province: textOrNull_(source[COD_SMS_PROVINCE_HEADER]),
    first_delivered_date: dateOrNull_(source['Ngày gán giao'], timezone, sheetRowNumber),
    end_delivery_date: dateOrNull_(source['Ngày kết thúc giao'], timezone, sheetRowNumber),
    return_date: dateOrNull_(source['Ngày chuyển hoàn'], timezone, sheetRowNumber),
    delivery_duration_days: numberOrNull_(
      source['Tổng thời gian giao (ngày)'], 'Tổng thời gian giao', sheetRowNumber,
      displaySource['Tổng thời gian giao (ngày)']
    ),
    reschedule_days_count: integerOrNull_(
      source['Số ngày hẹn giao lại'], 'Số ngày hẹn giao lại', sheetRowNumber,
      displaySource['Số ngày hẹn giao lại']
    ),
    signal_count_over_p90: booleanOrFalse_(source['Bất thường call log (so P90 hardcode)'], 'M1', sheetRowNumber),
    answered_call_count: answeredCallCount,
    signal_no_listener: answeredCallCount === 0,
    first_fail_note: textOrNull_(source['Lý do fail ca giao đầu tiên']),
    signal_missing_sop_reason: booleanOrFalse_(source['Thiếu dữ liệu order_fail_reason (M14)'], 'M14', sheetRowNumber),
    signal_reason_conflict: booleanOrFalse_(source['Mâu thuẫn lý do vs duration (M7)'], 'M7', sheetRowNumber),
    consecutive_attempt_gap_days: numberOrNull_(
      source['Số ngày cách ca thử giao tiếp theo'], 'Khoảng cách ca thử giao', sheetRowNumber,
      displaySource['Số ngày cách ca thử giao tiếp theo']
    ),
    signal_reschedule_gap_over_2d: booleanOrFalse_(source['Hẹn lại nhưng cách >=2 ngày (M8)'], 'M8', sheetRowNumber),
    signal_fake_call: booleanOrFalse_(source['Call log giả từ lần thử 2 (M9)'], 'M9', sheetRowNumber),
    success_distance_km: numberOrNull_(
      source['Khoảng cách GPS lúc thành công (km)'], 'Khoảng cách GPS', sheetRowNumber,
      displaySource['Khoảng cách GPS lúc thành công (km)']
    ),
    signal_gps_far: booleanOrFalse_(source['GPS bất thường lúc thành công (M10)'], 'M10', sheetRowNumber),
    signal_gps_duplicate: booleanOrFalse_(source['GPS trùng khớp giữa nhiều đơn (M11)'], 'M11', sheetRowNumber),
    signal_gps_mocked: booleanOrFalse_(source['GPS mocked lúc thành công (M12)'], 'M12', sheetRowNumber),
    signal_call_duplicate: booleanOrFalse_(source['Call log trùng khớp giữa nhiều đơn (M15)'], 'M15', sheetRowNumber),
    signal_fail_reason_clustered: booleanOrFalse_(source['Nhiều đơn cùng lý do fail, cập nhật gần nhau (M16)'], 'M16', sheetRowNumber),
    total_score: integerOrNull_(
      source['Điểm tổng nghi vấn'], 'Điểm tổng nghi vấn', sheetRowNumber, displaySource['Điểm tổng nghi vấn']
    ),
    avg_call_duration_seconds: numberOrNull_(
      source['TB thời lượng 1 cuộc gọi (giây)'], 'TB thời lượng 1 cuộc gọi', sheetRowNumber,
      displaySource['TB thời lượng 1 cuộc gọi (giây)']
    ),
    avg_ring_duration_seconds: numberOrNull_(
      source['TB thời lượng đổ chuông (giây)'], 'TB thời lượng đổ chuông', sheetRowNumber,
      displaySource['TB thời lượng đổ chuông (giây)']
    ),
    call_log_count: integerOrNull_(
      source['Số lượng call log (đơn này)'], 'Số lượng call log', sheetRowNumber,
      displaySource['Số lượng call log (đơn này)']
    ),
    driver_suspicious_order_count: integerOrNull_(
      source['so_don_nghi_van_cua_tai_xe'], 'Số đơn nghi vấn tài xế', sheetRowNumber,
      displaySource['so_don_nghi_van_cua_tai_xe']
    ),
    driver_order_rank: integerOrNull_(
      source['rn_trong_tai_xe'], 'rn_trong_tai_xe', sheetRowNumber, displaySource['rn_trong_tai_xe']
    ),
    driver_qualifies: booleanOrFalse_(source['tai_xe_dat_dieu_kien'], 'tai_xe_dat_dieu_kien', sheetRowNumber),
    call_verification_priority: enumText_(source[COD_SMS_PRIORITY_HEADER], ['Cao', 'Trung bình', 'Thấp'], COD_SMS_PRIORITY_HEADER, sheetRowNumber)
  };
}

function normalizeSmsMessage_(source, order, timezone, sheetRowNumber) {
  const content = textOrNull_(source['SMS - nội dung']);
  const smsTime = datetimeOrNull_(source['SMS - thời gian'], timezone, sheetRowNumber);
  const recipientType = textOrNull_(source['SMS - loại người nhận']);

  if (!content && !smsTime && !recipientType) return null;
  if (!content) {
    throw new Error('Dòng ' + sheetRowNumber + ' có metadata SMS nhưng thiếu nội dung SMS.');
  }
  if (!smsTime) {
    throw new Error('Dòng ' + sheetRowNumber + ' có nội dung SMS nhưng thiếu thời gian SMS.');
  }

  return {
    suspicion_type: order.suspicion_type,
    driver_id: order.driver_id,
    order_code: order.order_code,
    sms_time: smsTime,
    recipient_type: recipientType,
    content: content
  };
}

function callCodSmsSnapshotRpc_(orders, smsMessages, snapshotMeta) {
  const serviceRoleKey = PropertiesService.getScriptProperties()
    .getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) {
    throw new Error('Chưa cấu hình Script Property SUPABASE_SERVICE_ROLE_KEY.');
  }

  const response = UrlFetchApp.fetch(
    COD_SMS_SUPABASE_URL + '/rest/v1/rpc/' + COD_SMS_RPC_NAME,
    {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: serviceRoleKey, Authorization: 'Bearer ' + serviceRoleKey },
      payload: JSON.stringify({ orders: orders, sms_messages: smsMessages, snapshot_meta: snapshotMeta }),
      muteHttpExceptions: true
    }
  );
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Supabase HTTP ' + status + ': ' + body);
  }
  return body ? JSON.parse(body) : { success: true };
}

function diffOrderFields_(previousOrder, currentOrder) {
  const fields = Object.keys(currentOrder);
  const diffs = fields
    .filter((field) => stableJson_(previousOrder[field]) !== stableJson_(currentOrder[field]))
    .map((field) => field + ' (' + stableJson_(previousOrder[field]) + ' vs ' + stableJson_(currentOrder[field]) + ')');
  return diffs.length > 0 ? diffs.join('; ') : '(không phát hiện cột lệch)';
}

function orderKey_(row) {
  return [row.suspicion_type, row.driver_id, row.order_code].join('\u001f');
}

function stableJson_(value) {
  return JSON.stringify(value);
}

function isBlank_(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function requiredText_(value) {
  return String(value).trim();
}

function textOrNull_(value) {
  return isBlank_(value) ? null : String(value).trim();
}

// IDs arrive as numbers (22671000) when the cell is numeric. String() keeps
// them exact up to 2^53, but a fractional value means the cell was mangled.
function idTextOrNull_(value, label, sheetRowNumber) {
  if (isBlank_(value)) return null;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('Dòng ' + sheetRowNumber + ': ' + label + ' không phải mã hợp lệ: ' + value);
    }
    return String(value);
  }
  return String(value).trim();
}

function numberOrNull_(value, label, sheetRowNumber, displayValue) {
  if (isBlank_(value)) return null;
  // Some cells in this tab carry a date format, so Sheets hands back a Date
  // for what is really a plain number (0 renders as "30.12", 3 as "2.1",
  // 14.9 as "13.1" 21:36). The number underneath is intact: it's the Sheets
  // serial (days since 1899-12-30), so convert back instead of guessing from
  // the rendered text — that guess read "30.12" as 30.12 and made rows of the
  // same order disagree, which dropped them as conflicts.
  if (value instanceof Date) {
    const recovered = sheetsSerialFromDate_(value);
    if (!Number.isFinite(recovered)) {
      throw new Error(
        'Dòng ' + sheetRowNumber + ': ' + label + ' bị định dạng thành ngày/giờ thay vì số (ô: ' +
        value + ', hiển thị: "' + displayValue + '") và không tự khôi phục được số. ' +
        'Hãy sửa lại ô trong sheet (đổi định dạng về số thuần).'
      );
    }
    return roundNumber_(recovered);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Dòng ' + sheetRowNumber + ': ' + label + ' không phải số hợp lệ: ' + value);
  }
  return roundNumber_(number);
}

// A Date only keeps millisecond precision (~1e-8 day), so a recovered serial
// can differ from the same value read as a number in the 9th decimal. Rounding
// every number to 6 decimals keeps the per-order consistency check exact.
function roundNumber_(number) {
  return Math.round(number * 1e6) / 1e6;
}

function sheetsSerialFromDate_(date) {
  // Read the wall-clock parts in the spreadsheet time zone (how Sheets
  // rendered the serial), then measure from the epoch in UTC so historical
  // offsets such as Saigon's 1899 local mean time don't leak in.
  const parts = Utilities.formatDate(date, spreadsheetTimeZone_(), 'yyyy|MM|dd|HH|mm|ss|SSS')
    .split('|').map(Number);
  const wallClockUtc = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5], parts[6]);
  return (wallClockUtc - Date.UTC(1899, 11, 30)) / 86400000;
}

let cachedSpreadsheetTimeZone_ = null;
function spreadsheetTimeZone_() {
  if (!cachedSpreadsheetTimeZone_) {
    cachedSpreadsheetTimeZone_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  }
  return cachedSpreadsheetTimeZone_;
}

function integerOrNull_(value, label, sheetRowNumber, displayValue) {
  const number = numberOrNull_(value, label, sheetRowNumber, displayValue);
  if (number === null) return null;
  if (!Number.isInteger(number)) {
    throw new Error('Dòng ' + sheetRowNumber + ': ' + label + ' phải là số nguyên: ' + value);
  }
  return number;
}


function booleanOrFalse_(value, label, sheetRowNumber) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || isBlank_(value)) return false;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'có', 'co', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'không', 'khong', 'no'].includes(normalized)) return false;
  throw new Error('Dòng ' + sheetRowNumber + ': ' + label + ' có boolean không hợp lệ: ' + value);
}

function enumText_(value, allowed, label, sheetRowNumber) {
  const text = textOrNull_(value);
  if (!text || !allowed.includes(text)) {
    throw new Error('Dòng ' + sheetRowNumber + ': ' + label + ' không hợp lệ: ' + value);
  }
  return text;
}

function dateOrNull_(value, timezone, sheetRowNumber) {
  if (isBlank_(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Dòng ' + sheetRowNumber + ': ngày phải có dạng yyyy-MM-dd: ' + value);
  }
  return text;
}

function datetimeOrNull_(value, timezone, sheetRowNumber) {
  if (isBlank_(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd HH:mm:ss');
  }
  const text = String(value).trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    throw new Error('Dòng ' + sheetRowNumber + ': thời gian SMS phải có dạng yyyy-MM-dd HH:mm:ss: ' + value);
  }
  return text;
}
