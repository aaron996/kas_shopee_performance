/**
 * Đồng bộ tab `goi_dau_COD` theo snapshot có SMS.
 *
 * Nguồn SQLLab có grain 1 dòng / SMS, trong khi bảng đơn COD phải có grain
 * 1 dòng / đơn. Script này aggregate trước khi gọi Supabase:
 *   - orders: 1 dòng / (suspicion_type, driver_id, order_code)
 *   - sms_messages: nhiều dòng / đơn, đã bỏ SMS trùng hoàn toàn
 *
 * Yêu cầu trước khi chạy production:
 *   1. Áp dụng migration tạo RPC `sync_kas_cod_suspicion_snapshot`.
 *   2. Đặt Script Property `SUPABASE_SERVICE_ROLE_KEY`.
 *   3. Không để nhánh COD cũ trong `sync-to-supabase.gs` chạy cùng snapshot.
 *
 * Không hard-code service role key. Hãy chạy `dryRunGoiDauCodSmsSnapshot()`
 * trước để đối chiếu counts, rồi mới chạy `syncGoiDauCodSmsSnapshot()`.
 */

const COD_SMS_SUPABASE_URL = 'https://iyjsihwgnzcytbojvoom.supabase.co';
const COD_SMS_SHEET_NAME = 'goi_dau_COD';
const COD_SMS_RPC_NAME = 'sync_kas_cod_suspicion_snapshot';
const COD_SMS_TRIGGER_HOUR = 8;
const COD_SMS_TRIGGER_MINUTE = 45;

// Required deliberately includes every source column currently used for
// operations/audit or for the SMS scoring pipeline. A renamed/dropped BI alias
// stops the refresh before it can replace a good snapshot with partial data.
const COD_SMS_REQUIRED_HEADERS = [
  'Loại nghi ngờ', 'ID tài xế', 'Tên tài xế', 'Trạng thái tài xế',
  'Ngày nghỉ việc (nếu có)', 'Mã đơn', 'Trạng thái hiện tại', 'COD', 'Kho giao',
  'Ngày gán giao', 'Ngày kết thúc giao', 'Ngày chuyển hoàn',
  'Tổng thời gian giao (ngày)', 'Số ngày hẹn giao lại', 'Ngày cuối có call log',
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
  'rn_trong_tai_xe', 'tai_xe_dat_dieu_kien', 'Mức ưu tiên gọi xác minh',
  'SMS - thời gian', 'SMS - loại người nhận', 'SMS - nội dung'
];

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
    total_drivers: snapshot.stats.total_drivers
  }));
}

/** Aggregate the sheet then atomically replace the COD + SMS snapshot. */
function syncGoiDauCodSmsSnapshot() {
  const snapshot = buildGoiDauCodSmsSnapshot_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const batchId = 'GOI_DAU_COD_SMS_' + Utilities.formatDate(
    new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmmss'
  );

  const response = callCodSmsSnapshotRpc_(snapshot.orders, snapshot.sms_messages, {
    batch_id: batchId,
    notes: 'Đồng bộ Apps Script tab goi_dau_COD, aggregate đơn và SMS',
    source_rows: snapshot.stats.source_rows,
    unique_orders: snapshot.orders.length,
    unique_sms_messages: snapshot.sms_messages.length
  });

  Logger.log('Đồng bộ snapshot COD + SMS thành công: ' + JSON.stringify(response));
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

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('Tab "' + COD_SMS_SHEET_NAME + '" trống hoặc chỉ có header.');
  }

  const headers = values[0].map((header) => String(header).trim());
  const missingHeaders = COD_SMS_REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error('Thiếu header bắt buộc: ' + missingHeaders.join(', '));
  }

  const ordersByKey = new Map();
  const smsByKey = new Map();
  const sourceRows = values.slice(1)
    .filter((row) => row.some((cell) => cell !== '' && cell !== null));

  sourceRows.forEach((row, index) => {
    const sheetRowNumber = index + 2;
    const source = rowToObject_(headers, row);
    const order = normalizeCodOrder_(source, ss.getSpreadsheetTimeZone(), sheetRowNumber);
    const key = orderKey_(order);
    const stableCore = stableJson_(order);
    const existing = ordersByKey.get(key);

    // Every repeated source row represents another SMS for the same order. If
    // any non-SMS field diverges, stop instead of selecting an arbitrary row.
    if (existing && existing.stable_core !== stableCore) {
      throw new Error(
        'Dòng ' + sheetRowNumber + ' có dữ liệu đơn không khớp với các dòng SMS trước đó: ' + key
      );
    }
    if (!existing) {
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

  const orders = Array.from(ordersByKey.values()).map((entry) => entry.order);
  const smsMessages = Array.from(smsByKey.values())
    .sort((a, b) => (
      a.order_code.localeCompare(b.order_code) ||
      String(a.sms_time || '').localeCompare(String(b.sms_time || '')) ||
      a.content.localeCompare(b.content)
    ));
  const ordersWithSms = new Set(smsMessages.map((sms) => orderKey_(sms))).size;

  return {
    orders: orders,
    sms_messages: smsMessages,
    stats: {
      source_rows: sourceRows.length,
      total_drivers: new Set(orders.map((order) => order.driver_id)).size,
      orders_with_sms: ordersWithSms,
      orders_without_sms: orders.length - ordersWithSms,
      duplicate_sms_removed: sourceRows.filter((row) => !isBlank_(row[headers.indexOf('SMS - nội dung')])).length - smsMessages.length
    }
  };
}

function rowToObject_(headers, row) {
  const source = {};
  headers.forEach((header, index) => {
    source[header] = row[index];
  });
  return source;
}

function normalizeCodOrder_(source, timezone, sheetRowNumber) {
  const required = ['Loại nghi ngờ', 'ID tài xế', 'Mã đơn', 'Trạng thái hiện tại'];
  const missing = required.filter((header) => isBlank_(source[header]));
  if (missing.length > 0) {
    throw new Error('Dòng ' + sheetRowNumber + ' thiếu: ' + missing.join(', '));
  }
  const answeredCallCount = integerOrNull_(
    source['Số cuộc gọi có người nghe'], 'Số cuộc gọi có người nghe', sheetRowNumber
  );

  return {
    suspicion_type: enumText_(source['Loại nghi ngờ'], ['Gối đầu COD', 'Rút ruột'], 'Loại nghi ngờ', sheetRowNumber),
    driver_id: requiredText_(source['ID tài xế']),
    driver_name: textOrNull_(source['Tên tài xế']),
    driver_status: textOrNull_(source['Trạng thái tài xế']),
    driver_resignation_date: dateOrNull_(source['Ngày nghỉ việc (nếu có)'], timezone, sheetRowNumber),
    order_code: requiredText_(source['Mã đơn']),
    order_status: requiredText_(source['Trạng thái hiện tại']),
    cod_amount: numberOrNull_(source['COD'], 'COD', sheetRowNumber),
    warehouse_name: textOrNull_(source['Kho giao']),
    first_delivered_date: dateOrNull_(source['Ngày gán giao'], timezone, sheetRowNumber),
    end_delivery_date: dateOrNull_(source['Ngày kết thúc giao'], timezone, sheetRowNumber),
    return_date: dateOrNull_(source['Ngày chuyển hoàn'], timezone, sheetRowNumber),
    delivery_duration_days: numberOrNull_(source['Tổng thời gian giao (ngày)'], 'Tổng thời gian giao', sheetRowNumber),
    reschedule_days_count: integerOrNull_(source['Số ngày hẹn giao lại'], 'Số ngày hẹn giao lại', sheetRowNumber),
    last_call_log_date: textOrNull_(source['Ngày cuối có call log']),
    signal_count_over_p90: booleanOrFalse_(source['Bất thường call log (so P90 hardcode)'], 'M1', sheetRowNumber),
    answered_call_count: answeredCallCount,
    signal_no_listener: answeredCallCount === 0,
    first_fail_note: textOrNull_(source['Lý do fail ca giao đầu tiên']),
    signal_missing_sop_reason: booleanOrFalse_(source['Thiếu dữ liệu order_fail_reason (M14)'], 'M14', sheetRowNumber),
    signal_reason_conflict: booleanOrFalse_(source['Mâu thuẫn lý do vs duration (M7)'], 'M7', sheetRowNumber),
    consecutive_attempt_gap_days: numberOrNull_(source['Số ngày cách ca thử giao tiếp theo'], 'Khoảng cách ca thử giao', sheetRowNumber),
    signal_reschedule_gap_over_2d: booleanOrFalse_(source['Hẹn lại nhưng cách >=2 ngày (M8)'], 'M8', sheetRowNumber),
    signal_fake_call: booleanOrFalse_(source['Call log giả từ lần thử 2 (M9)'], 'M9', sheetRowNumber),
    success_distance_km: numberOrNull_(source['Khoảng cách GPS lúc thành công (km)'], 'Khoảng cách GPS', sheetRowNumber),
    signal_gps_far: booleanOrFalse_(source['GPS bất thường lúc thành công (M10)'], 'M10', sheetRowNumber),
    signal_gps_duplicate: booleanOrFalse_(source['GPS trùng khớp giữa nhiều đơn (M11)'], 'M11', sheetRowNumber),
    signal_gps_mocked: booleanOrFalse_(source['GPS mocked lúc thành công (M12)'], 'M12', sheetRowNumber),
    signal_call_duplicate: booleanOrFalse_(source['Call log trùng khớp giữa nhiều đơn (M15)'], 'M15', sheetRowNumber),
    signal_fail_reason_clustered: booleanOrFalse_(source['Nhiều đơn cùng lý do fail, cập nhật gần nhau (M16)'], 'M16', sheetRowNumber),
    total_score: integerOrNull_(source['Điểm tổng nghi vấn'], 'Điểm tổng nghi vấn', sheetRowNumber),
    avg_call_duration_seconds: numberOrNull_(source['TB thời lượng 1 cuộc gọi (giây)'], 'TB thời lượng 1 cuộc gọi', sheetRowNumber),
    avg_ring_duration_seconds: numberOrNull_(source['TB thời lượng đổ chuông (giây)'], 'TB thời lượng đổ chuông', sheetRowNumber),
    call_log_count: integerOrNull_(source['Số lượng call log (đơn này)'], 'Số lượng call log', sheetRowNumber),
    driver_suspicious_order_count: integerOrNull_(source['so_don_nghi_van_cua_tai_xe'], 'Số đơn nghi vấn tài xế', sheetRowNumber),
    driver_order_rank: integerOrNull_(source['rn_trong_tai_xe'], 'rn_trong_tai_xe', sheetRowNumber),
    driver_qualifies: booleanOrFalse_(source['tai_xe_dat_dieu_kien'], 'tai_xe_dat_dieu_kien', sheetRowNumber),
    call_verification_priority: enumText_(source['Mức ưu tiên gọi xác minh'], ['Cao', 'Trung bình', 'Thấp'], 'Mức ưu tiên gọi xác minh', sheetRowNumber)
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

function numberOrNull_(value, label, sheetRowNumber) {
  if (isBlank_(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error('Dòng ' + sheetRowNumber + ': ' + label + ' không phải số hợp lệ: ' + value);
  }
  return number;
}

function integerOrNull_(value, label, sheetRowNumber) {
  const number = numberOrNull_(value, label, sheetRowNumber);
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
