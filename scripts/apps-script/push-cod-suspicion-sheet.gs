/**
 * Đẩy danh sách đơn nghi ngờ COD (tài xế mức Vừa/Cao) về spreadsheet này.
 *
 * Script gắn vào spreadsheet đích và chạy bằng tài khoản @ghn, nên không cần
 * share sheet cho email/service account bên ngoài. App tính sẵn danh sách
 * (điểm SQL, nâng bậc theo điểm SMS AI, loại tài xế đã kết luận không vi
 * phạm); script chỉ đọc API rồi ghi 2 tab:
 *   - `nghi_ngo_COD`: ghi đè toàn bộ mỗi lần chạy.
 *   - `nghi_ngo_COD_log`: chỉ nối thêm đơn chưa từng có (theo Loại nghi ngờ +
 *     Mã đơn), không ghi lại dù SMS/call/COD của đơn thay đổi.
 *
 * Cài đặt:
 *   1. Extensions → Apps Script trong spreadsheet đích, dán file này.
 *   2. Project Settings → Script Properties: thêm `COD_EXPORT_API_TOKEN`
 *      (cùng giá trị với env `COD_EXPORT_API_TOKEN` trên Vercel).
 *   3. Chạy `dryRunCodSuspicionSheet()` để xem số liệu, rồi
 *      `pushCodSuspicionSheet()` một lần, rồi `createCodSuspicionSheetTrigger()`.
 */

const COD_EXPORT_API_URL = 'https://kas-shopee-performance.vercel.app/api/cod-suspicion-export';
const COD_EXPORT_SHEET_NAME = 'nghi_ngo_COD';
const COD_EXPORT_LOG_SHEET_NAME = 'nghi_ngo_COD_log';
// Cron chấm SMS chạy trong khung 09:00–09:59 (Vercel Hobby không chạy đúng
// phút), nên đẩy sheet lúc ~10:15 để luôn có điểm SMS mới.
const COD_EXPORT_TRIGGER_HOUR = 10;
const COD_EXPORT_TRIGGER_MINUTE = 15;
// Mã đơn, ID tài xế, Mã bưu cục giữ dạng text để Sheets không đổi thành số.
const COD_EXPORT_TEXT_COLUMNS = ['Mã đơn', 'ID tài xế', 'Mã bưu cục'];

/** Gọi API và log số liệu, không ghi sheet. */
function dryRunCodSuspicionSheet() {
  const data = fetchCodSuspicionExport_();
  const logKeys = readLogKeys_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COD_EXPORT_LOG_SHEET_NAME));
  Logger.log(JSON.stringify({
    generated_at: data.generatedAt,
    snapshot_synced_at: data.snapshotSyncedAt,
    last_sms_run: data.lastSmsRun,
    threshold: data.threshold,
    source_orders: data.sourceOrders,
    exported_orders: data.rows.length,
    exported_drivers: data.exportedDrivers,
    new_log_rows: selectNewLogRows_(data.rows, logKeys).length
  }));
}

/** Ghi đè tab chính và nối đơn mới vào tab log. */
function pushCodSuspicionSheet() {
  const data = fetchCodSuspicionExport_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const table = [data.headers].concat(data.rows);

  const sheet = getOrCreateSheet_(ss, COD_EXPORT_SHEET_NAME);
  applyTextFormat_(sheet, data.headers, 1, table.length);
  sheet.getRange(1, 1, table.length, data.headers.length).setValues(table);
  const lastRow = sheet.getLastRow();
  if (lastRow > table.length) {
    sheet.getRange(table.length + 1, 1, lastRow - table.length, data.headers.length).clearContent();
  }

  const logSheet = getOrCreateSheet_(ss, COD_EXPORT_LOG_SHEET_NAME);
  const newLogRows = selectNewLogRows_(data.rows, readLogKeys_(logSheet));
  const logPayload = logSheet.getLastRow() === 0 ? [data.headers].concat(newLogRows) : newLogRows;
  if (logPayload.length > 0) {
    const startRow = logSheet.getLastRow() + 1;
    applyTextFormat_(logSheet, data.headers, startRow, logPayload.length);
    logSheet.getRange(startRow, 1, logPayload.length, data.headers.length).setValues(logPayload);
  }

  if (data.lastSmsRun && data.lastSmsRun.status === 'running') {
    Logger.log('LƯU Ý: lượt chấm SMS gần nhất vẫn đang chạy, một số đơn có thể chưa có điểm SMS mới.');
  }
  Logger.log('Đẩy sheet nghi ngờ COD thành công: ' + JSON.stringify({
    generated_at: data.generatedAt,
    snapshot_synced_at: data.snapshotSyncedAt,
    exported_orders: data.rows.length,
    exported_drivers: data.exportedDrivers,
    new_log_rows: newLogRows.length
  }));
}

/** Tạo lại đúng 1 trigger hằng ngày cho pushCodSuspicionSheet. */
function createCodSuspicionSheetTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'pushCodSuspicionSheet')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('pushCodSuspicionSheet')
    .timeBased()
    .atHour(COD_EXPORT_TRIGGER_HOUR)
    .nearMinute(COD_EXPORT_TRIGGER_MINUTE)
    .everyDays(1)
    .inTimezone('Asia/Ho_Chi_Minh')
    .create();
}

function fetchCodSuspicionExport_() {
  const token = PropertiesService.getScriptProperties().getProperty('COD_EXPORT_API_TOKEN');
  if (!token) {
    throw new Error('Chưa cấu hình Script Property COD_EXPORT_API_TOKEN.');
  }
  const response = UrlFetchApp.fetch(COD_EXPORT_API_URL, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status !== 200) {
    throw new Error('API export COD HTTP ' + status + ': ' + body.slice(0, 500));
  }
  const data = JSON.parse(body);
  // Không ghi đè tab khi response lệch hợp đồng, để giữ bản tốt gần nhất.
  if (data.contractVersion !== '1' || !Array.isArray(data.headers) || !Array.isArray(data.rows) ||
      data.rows.some((row) => !Array.isArray(row) || row.length !== data.headers.length)) {
    throw new Error('API export COD trả dữ liệu không đúng định dạng.');
  }
  return data;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function applyTextFormat_(sheet, headers, startRow, rowCount) {
  COD_EXPORT_TEXT_COLUMNS.forEach((header) => {
    const column = headers.indexOf(header) + 1;
    if (column > 0) sheet.getRange(startRow, column, rowCount, 1).setNumberFormat('@');
  });
}

function logKey_(suspicionType, orderCode) {
  return String(suspicionType).trim() + '\u001f' + String(orderCode).trim();
}

function readLogKeys_(logSheet) {
  const keys = new Set();
  if (!logSheet || logSheet.getLastRow() < 2) return keys;
  logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 2).getDisplayValues().forEach((row) => {
    if (String(row[1]).trim()) keys.add(logKey_(row[0], row[1]));
  });
  return keys;
}

function selectNewLogRows_(rows, loggedKeys) {
  const seen = new Set(loggedKeys);
  return rows.filter((row) => {
    const key = logKey_(row[0], row[1]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
