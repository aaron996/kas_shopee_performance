/**
 * Đồng bộ 5 tab (Pick / Deli / Ca1 / Leadtime / FD) của Google Sheet nguồn vào 5
 * bảng Supabase dạng quan hệ bình thường (kas_pick_data / kas_deli_data /
 * kas_ca1_data / kas_leadtime_data / kas_fd_data, mỗi tab 1 bảng, mỗi dòng sheet
 * 1 dòng SQL), thay cho cách app đọc trực tiếp link CSV public ("Anyone with
 * link can view") — cách đó đã bị chặn khi GHN tắt share ra ngoài domain.
 *
 * Mỗi lần chạy gọi 1 hàm SQL (sync_kas_pick_data / sync_kas_deli_data /
 * sync_kas_ca1_data / sync_kas_leadtime_data / sync_kas_fd_data) làm full-refresh
 * atomic (xoá hết rồi insert lại trong 1 transaction) — không upsert theo key vì
 * data thật không có cột nào là unique key tự nhiên.
 *
 * Vì script này chạy NGAY TRONG chính file Sheet (Extensions > Apps Script),
 * dưới quyền của người sở hữu/đang mở file, nó đọc được dữ liệu bất kể sheet
 * có share public hay không — không phụ thuộc chính sách share-ra-ngoài.
 *
 * === CÀI ĐẶT (làm 1 lần) ===
 * 1. Mở Google Sheet nguồn → Extensions → Apps Script.
 * 2. Xoá nội dung mẫu, dán toàn bộ nội dung file này vào.
 * 3. Project Settings (icon bánh răng) → Script Properties → Add script
 *    property:
 *      - Property: SUPABASE_SERVICE_ROLE_KEY
 *      - Value: <lấy trong Supabase Dashboard > Project Settings > API >
 *                service_role secret key> — KHÔNG hardcode key vào code.
 * 4. Chạy hàm `syncAllTabs` một lần thủ công (Run) để cấp quyền
 *    (Authorize access) — cần cấp quyền đọc Sheet hiện tại + gọi URL ngoài.
 * 5. Chạy hàm `createDailyTrigger` một lần (Run) để tự tạo trigger 1 lần/ngày.
 *    KHÔNG tạo trigger qua UI (Triggers > Add Trigger > Day timer) — kiểu
 *    "Day timer, 8am to 9am" của UI chỉ hứa chạy TRONG khung giờ đó, có thể
 *    rơi vào 8:01AM (trước khi BI kịp đổ data lúc 8:15) mà không có cách nào
 *    ghim giờ chính xác hơn từ UI. `createDailyTrigger` dùng `nearMinute()`
 *    để ghim giờ chạy gần đúng MIN_RUN_HOUR:MIN_RUN_MINUTE hơn nhiều.
 *    Nếu trước đó đã lỡ tạo trigger qua UI, hàm này cũng tự xoá trigger cũ
 *    của syncAllTabs trước khi tạo trigger mới, để không bị chạy trùng.
 * 6. Xong — mỗi ngày trigger tự chạy 1 lần; app đọc live từ Supabase (không
 *    cần đăng nhập gì thêm). Muốn đổi lại chạy nhiều lần/ngày thì tự thêm
 *    trigger như cũ, guard giờ chạy ở dưới vẫn sẽ chặn các lần chạy quá sớm.
 *
 * Muốn chạy tay lại RIÊNG 1 tab (vd chỉ test/fix lại tab FD sau khi đổi cột
 * trên Sheet, không muốn đẩy lại cả 4 tab kia): chọn hàm tương ứng ở dropdown
 * trên cùng của Apps Script editor rồi bấm Run — syncPickOnly / syncDeliOnly /
 * syncCa1Only / syncLeadtimeOnly / syncFdOnly. Các hàm này chạy ngay, không
 * bị chặn bởi guard giờ MIN_RUN_HOUR:MIN_RUN_MINUTE (khác với syncAllTabs).
 *
 * Muốn đổi Spreadsheet ID / gid các tab thì sửa các hằng số ngay dưới đây.
 */

const SUPABASE_URL = 'https://iyjsihwgnzcytbojvoom.supabase.co';

// BI đổ data về Sheet lúc 8h15 mỗi ngày — chừa thêm buffer, không chạy sync
// trước giờ này. Đây là chốt chặn Ở CODE, độc lập với trigger: dù trigger có
// lỡ chạy sớm (jitter của Apps Script, hoặc ai đó bấm Run tay để test) thì
// sync vẫn không đẩy data cũ/thiếu lên Supabase.
const MIN_RUN_HOUR = 8;
const MIN_RUN_MINUTE = 30;

// Các gid tab hiện tại.
// gid ổn định hơn tên tab — đổi tên tab không làm hỏng script, chỉ đổi gid
// (ví dụ nếu tab bị xoá & tạo lại) mới cần sửa lại các số này.
const TAB_GIDS = {
  pick: 1312031199,
  deli: 940798880,
  ca1: 1405399014,
  leadtime: 396308004,
  fd: 1207390624
};

// Mỗi tab ứng với 1 hàm RPC full-refresh riêng trong Supabase
const TAB_RPC_FUNCTIONS = {
  pick: 'sync_kas_pick_data',
  deli: 'sync_kas_deli_data',
  ca1: 'sync_kas_ca1_data',
  leadtime: 'sync_kas_leadtime_data',
  fd: 'sync_kas_fd_data'
};

/**
 * Tạo trigger chạy `syncAllTabs` 1 lần/ngày, ghim gần đúng
 * MIN_RUN_HOUR:MIN_RUN_MINUTE (chính xác hơn UI Trigger vốn chỉ chọn được cả
 * khung giờ, vd "8am to 9am"). Chạy hàm này 1 LẦN thủ công lúc cài đặt — nó
 * tự xoá trigger cũ của syncAllTabs trước khi tạo trigger mới, nên chạy lại
 * bao nhiêu lần cũng không bị tạo trùng.
 *
 * Lưu ý: Apps Script không hứa chạy chính xác tuyệt đối tới từng phút — chỉ
 * đảm bảo chạy trong khoảng ~15 phút kể từ nearMinute. Đây là lý do vẫn cần
 * chốt chặn ở isBeforeRunWindow_() bên dưới làm lớp bảo vệ thứ 2.
 */
function createDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncAllTabs')
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncAllTabs')
    .timeBased()
    .atHour(MIN_RUN_HOUR)
    .nearMinute(MIN_RUN_MINUTE + 15) // thêm buffer để không rơi đúng biên dưới
    .everyDays(1)
    .inTimezone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone())
    .create();

  Logger.log('Đã tạo trigger syncAllTabs chạy 1 lần/ngày, gần ' + MIN_RUN_HOUR + ':' + (MIN_RUN_MINUTE + 15) + '.');
}

/**
 * true nếu thời điểm hiện tại (theo timezone của Sheet) còn TRƯỚC
 * MIN_RUN_HOUR:MIN_RUN_MINUTE — tức là chưa nên sync (BI có thể chưa đổ data
 * xong lúc 8h15).
 */
function isBeforeRunWindow_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, tz, 'H'));
  const minute = Number(Utilities.formatDate(now, tz, 'm'));
  return hour < MIN_RUN_HOUR || (hour === MIN_RUN_HOUR && minute < MIN_RUN_MINUTE);
}

function syncAllTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (isBeforeRunWindow_(ss)) {
    Logger.log(
      'Bỏ qua lần chạy này: mới ' +
      Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'HH:mm') +
      ', còn trước ' + MIN_RUN_HOUR + ':' + (MIN_RUN_MINUTE < 10 ? '0' : '') + MIN_RUN_MINUTE +
      ' — BI có thể chưa đổ data về Sheet xong.'
    );
    return;
  }

  const errors = [];

  Object.keys(TAB_GIDS).forEach((tabKey) => {
    try {
      syncOneTab(ss, tabKey, TAB_GIDS[tabKey], TAB_RPC_FUNCTIONS[tabKey]);
    } catch (err) {
      errors.push(tabKey + ': ' + err.message);
    }
  });

  if (errors.length > 0) {
    throw new Error('Sync lỗi ở (các) tab: ' + errors.join(' | '));
  }
}

/**
 * Chạy tay 1 tab riêng lẻ, KHÔNG qua guard giờ chạy (isBeforeRunWindow_) —
 * dùng khi cần test/fix lại đúng 1 tab (vd sau khi đổi cột trên Sheet hoặc
 * sửa RPC function) mà không muốn đẩy lại toàn bộ 4 tab còn lại. Chọn đúng
 * tên hàm tương ứng ở dropdown trên cùng của Apps Script editor rồi bấm Run.
 *
 * Lưu ý: đây là chạy thủ công một lần, không tạo trigger lịch riêng — lịch tự
 * động hàng ngày vẫn chỉ có 1 trigger duy nhất gọi syncAllTabs (xem
 * createDailyTrigger). Muốn đổi giờ chạy tự động thì sửa MIN_RUN_HOUR/
 * MIN_RUN_MINUTE ở đầu file, không phải sửa các hàm dưới đây.
 */
function syncPickOnly() {
  syncOneTab(SpreadsheetApp.getActiveSpreadsheet(), 'pick', TAB_GIDS.pick, TAB_RPC_FUNCTIONS.pick);
}

function syncDeliOnly() {
  syncOneTab(SpreadsheetApp.getActiveSpreadsheet(), 'deli', TAB_GIDS.deli, TAB_RPC_FUNCTIONS.deli);
}

function syncCa1Only() {
  syncOneTab(SpreadsheetApp.getActiveSpreadsheet(), 'ca1', TAB_GIDS.ca1, TAB_RPC_FUNCTIONS.ca1);
}

function syncLeadtimeOnly() {
  syncOneTab(SpreadsheetApp.getActiveSpreadsheet(), 'leadtime', TAB_GIDS.leadtime, TAB_RPC_FUNCTIONS.leadtime);
}

function syncFdOnly() {
  syncOneTab(SpreadsheetApp.getActiveSpreadsheet(), 'fd', TAB_GIDS.fd, TAB_RPC_FUNCTIONS.fd);
}

function syncOneTab(ss, tabKey, gid, rpcFunctionName) {
  const sheet = ss.getSheets().find((s) => s.getSheetId() === gid);
  if (!sheet) {
    throw new Error('Không tìm thấy tab với gid ' + gid);
  }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('Tab trống hoặc chỉ có header');
  }

  const headers = values[0].map((h) => String(h).trim());
  const rows = values.slice(1)
    // Bỏ các dòng hoàn toàn rỗng (thường do format kéo dài quá header)
    .filter((row) => row.some((cell) => cell !== '' && cell !== null))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        const cell = row[i];
        // Chuẩn hoá Date object của Apps Script về "yyyy-MM-dd" cho các cột ngày,
        // để khớp định dạng report_date mà app đang parse (parseToLocal trong
        // src/utils/dataProcessor.js).
        obj[h] = cell instanceof Date
          ? Utilities.formatDate(cell, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
          : cell;
      });
      return obj;
    });

  const serviceKey = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    throw new Error('Chưa cấu hình Script Property SUPABASE_SERVICE_ROLE_KEY');
  }

  // Gọi hàm SQL full-refresh (xoá hết + insert lại trong 1 transaction) —
  // tên tham số "payload" phải khớp đúng tên tham số của hàm SQL
  // sync_kas_*_data(payload jsonb).
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/' + rpcFunctionName, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey
    },
    payload: JSON.stringify({ payload: rows }),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code >= 300) {
    throw new Error('Supabase trả lỗi HTTP ' + code + ': ' + res.getContentText());
  }

  Logger.log(tabKey + ': đã đẩy ' + rows.length + ' dòng lên Supabase (bảng kas_' + tabKey + '_data).');
}
