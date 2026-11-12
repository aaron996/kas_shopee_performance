/**
 * Đồng bộ backlog SPE Reverse (client 224845) từ tab reverse_backlog sang bảng kas_reverse_backlog. Thêm file này vào project
 * Apps Script ~auto~ (dùng lại opsDeltaNormalizeRows_ và opsDeltaRpc_ của ops-incremental-sync.gs, opsHistoryKey_ và
 * opsHistoryShift_ của ops-history-sync.gs).
 *
 * BI ghi một ảnh backlog hằng ngày vào tab reverse_backlog với header: snapshot_date, client_name, region, hub_type,
 * assign_bucket (0 | 1-2 | 3+), age_bucket (1-3 | 4-7 | 8-14), backlog_orders. Tổ hợp không có đơn có thể vắng mặt (= 0).
 * Chạy syncReverseBacklog() sau khi BI đổ tab (trigger hằng ngày bằng createReverseBacklogDailyTrigger()).
 * Mỗi snapshot_date trong tab được thay trọn vẹn; các ngày snapshot khác trong bảng giữ nguyên để so sánh tuần trước.
 * Tab phải có đúng một snapshot_date là hôm nay hoặc hôm qua, nếu không thì không ghi gì.
 */
const REVERSE_BACKLOG_TAB = 'reverse_backlog';
const REVERSE_BACKLOG_CLIENT = 'SPE Reverse';
const REVERSE_BACKLOG_TRIGGER_HOUR = 9;
const REVERSE_BACKLOG_ASSIGN = ['0', '1-2', '3+'];
const REVERSE_BACKLOG_AGE = ['1-3', '4-7', '8-14'];
const REVERSE_BACKLOG_COLUMNS = [
  {name:'snapshot_date',type:'date'},{name:'client_name',type:'text'},{name:'region',type:'text'},{name:'hub_type',type:'text'},
  {name:'assign_bucket',type:'text'},{name:'age_bucket',type:'text'},{name:'backlog_orders',type:'numeric'}
];

/**
 * Sheets tự đổi ô "1-3", "4-7", "1-2" thành ngày (1/3, 4/7, 1/2) và getValues() trả về Date. Đổi ngược Date thành "d-M"
 * (ngày-tháng, đúng cách Sheets đã đọc) rồi vẫn kiểm tra bucket phải nằm trong danh sách hợp lệ. "8-14", "0", "3+" giữ là chuỗi.
 */
function reverseBacklogBucket_(value, timezone) {
  return value instanceof Date ? Utilities.formatDate(value,timezone,'d-M') : value;
}

function reverseBacklogRows_(sheet, timezone) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Tab '+sheet.getName()+' trống hoặc chỉ có header');
  const headers = values[0].map(h => String(h).trim());
  const bucketIndexes = ['assign_bucket','age_bucket'].map(name => headers.indexOf(name)).filter(i => i >= 0);
  const fixed = values.slice(1).map(row => row.map((cell,i) => bucketIndexes.includes(i) ? reverseBacklogBucket_(cell,timezone) : cell));
  const rows = opsDeltaNormalizeRows_(headers,fixed,REVERSE_BACKLOG_COLUMNS,timezone);
  return rows.map((row,i) => {
    const out = row.slice();
    out[1] = String(row[1]||'').trim(); out[2] = String(row[2]||'').trim() || null; out[3] = String(row[3]||'').trim() || null;
    out[4] = String(row[4]).trim(); out[5] = String(row[5]).trim();
    if (out[1] !== REVERSE_BACKLOG_CLIENT) throw new Error('Dòng '+(i+2)+': client_name phải là '+REVERSE_BACKLOG_CLIENT+', nhận "'+out[1]+'"');
    if (!REVERSE_BACKLOG_ASSIGN.includes(out[4])) throw new Error('Dòng '+(i+2)+': assign_bucket không hợp lệ "'+out[4]+'"');
    if (!REVERSE_BACKLOG_AGE.includes(out[5])) throw new Error('Dòng '+(i+2)+': age_bucket không hợp lệ "'+out[5]+'"');
    if (out[6] === null || out[6] < 0) throw new Error('Dòng '+(i+2)+': backlog_orders phải là số không âm');
    return out;
  });
}

/** Hằng ngày: thay snapshot của tab reverse_backlog vào bảng kas_reverse_backlog. */
function syncReverseBacklog() {
  const key = opsHistoryKey_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REVERSE_BACKLOG_TAB);
  if (!sheet) throw new Error('Không thấy tab '+REVERSE_BACKLOG_TAB);
  const timezone = ss.getSpreadsheetTimeZone();
  const rows = reverseBacklogRows_(sheet,timezone);
  const today = Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd');
  const days = Array.from(new Set(rows.map(r => r[0]))).sort();
  if (days.length !== 1) throw new Error('Tab '+REVERSE_BACKLOG_TAB+' phải có đúng một snapshot_date (nguồn: '+days.join(', ')+'); không ghi gì');
  if (days[0] !== today && days[0] !== opsHistoryShift_(today,1)) {
    throw new Error('Snapshot '+days[0]+' cũ hơn hôm qua (hôm nay '+today+'); không ghi gì');
  }
  const objects = rows.map(row => {
    const o = {}; REVERSE_BACKLOG_COLUMNS.forEach((c,j) => {o[c.name]=row[j];}); return o;
  });
  const result = opsDeltaRpc_('upsert_kas_reverse_backlog',{rows:objects},key);
  Logger.log(JSON.stringify({tab:REVERSE_BACKLOG_TAB,snapshot:days[0],rows:rows.length,
    total:rows.reduce((sum,r) => sum+r[6],0),result:result}));
}

/** Chạy một lần: đặt trigger hằng ngày cho syncReverseBacklog (xoá trigger cũ của hàm này, không đụng trigger khác). */
function createReverseBacklogDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncReverseBacklog')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncReverseBacklog')
    .timeBased()
    .atHour(REVERSE_BACKLOG_TRIGGER_HOUR)
    .nearMinute(15)
    .everyDays(1)
    .inTimezone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone())
    .create();
  Logger.log('Đã đặt trigger syncReverseBacklog hằng ngày khoảng '+REVERSE_BACKLOG_TRIGGER_HOUR+':15');
}
