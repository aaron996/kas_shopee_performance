/**
 * Đồng bộ 3 tab (Pick / Deli / Ca1) của Google Sheet nguồn vào bảng Supabase
 * `sheet_sync_data`, thay cho cách app đọc trực tiếp link CSV public
 * ("Anyone with link can view") — cách đó đã bị chặn khi GHN tắt share
 * ra ngoài domain.
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
 * 5. Vào Triggers (icon đồng hồ bên trái) → Add Trigger:
 *      - Function: syncAllTabs
 *      - Event source: Time-driven
 *      - Type: Minutes timer → Every 15 minutes (tuỳ nhu cầu)
 * 6. Xong — mỗi lần trigger chạy, Apps Script tự đẩy data mới nhất lên
 *    Supabase; app sẽ đọc live từ đó (không cần đăng nhập gì thêm).
 *
 * Muốn đổi Spreadsheet ID / gid các tab thì sửa 3 hằng số ngay dưới đây.
 */

const SUPABASE_URL = 'https://iyjsihwgnzcytbojvoom.supabase.co';

// Các gid tab hiện tại (khớp với TAB_GIDS trong src/utils/googleSheetsSync.js).
// gid ổn định hơn tên tab — đổi tên tab không làm hỏng script, chỉ đổi gid
// (ví dụ nếu tab bị xoá & tạo lại) mới cần sửa lại các số này.
const TAB_GIDS = {
  pick: 1312031199,
  deli: 940798880,
  ca1: 1405399014
};

function syncAllTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errors = [];

  Object.keys(TAB_GIDS).forEach((tabKey) => {
    try {
      syncOneTab(ss, tabKey, TAB_GIDS[tabKey]);
    } catch (err) {
      errors.push(tabKey + ': ' + err.message);
    }
  });

  if (errors.length > 0) {
    throw new Error('Sync lỗi ở (các) tab: ' + errors.join(' | '));
  }
}

function syncOneTab(ss, tabKey, gid) {
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

  const payload = [{
    tab_name: tabKey,
    rows: rows,
    row_count: rows.length,
    updated_at: new Date().toISOString()
  }];

  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/sheet_sync_data?on_conflict=tab_name', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code >= 300) {
    throw new Error('Supabase trả lỗi HTTP ' + code + ': ' + res.getContentText());
  }

  Logger.log(tabKey + ': đã đẩy ' + rows.length + ' dòng lên Supabase.');
}
