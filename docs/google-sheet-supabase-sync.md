# Đồng bộ Google Sheet → Supabase (thay cho link CSV public)

## Vì sao cần đổi

App trước đây đọc data bằng cách gọi thẳng link CSV export của Google Sheet
(`docs.google.com/spreadsheets/d/.../export?format=csv`) từ browser, không
đăng nhập. Cách này **chỉ** chạy được khi Sheet để chế độ
"Anyone with link can view". Từ khi GHN chặn share-ra-ngoài ở cấp Workspace,
sheet không thể để chế độ đó nữa → link CSV trả 401/403 → app không tự sync
được.

Quan trọng: không có cấp share nào khác (kể cả share nội bộ domain
`@ghn.vn`) cứu được cách gọi cũ, vì một `fetch()` không đăng nhập không bao
giờ mang theo cookie Google của người xem — nó luôn là request vô danh. Nên
đây là đổi kiến trúc, không phải chỉnh 1 setting.

## Hướng giải quyết

Một Google Apps Script gắn thẳng vào file Sheet nguồn, chạy dưới quyền của
người sở hữu/đang mở file (không phải "public"), tự đẩy dữ liệu 3 tab
(Pick / Deli / Ca1) vào bảng `sheet_sync_data` trên Supabase theo lịch. App
đọc dữ liệu từ Supabase (project đã dùng sẵn cho auth) thay vì đọc trực tiếp
Google Sheet.

```
Google Sheet (Apps Script, quyền owner)
        │  UrlFetchApp.fetch() mỗi 15' — không phụ thuộc share settings
        ▼
Supabase table: sheet_sync_data (service_role ghi, authenticated đọc)
        │  supabase-js (anon key + user session)
        ▼
App (src/utils/supabaseSheetSync.js) → App.jsx state (pickRows/deliRows/ca1Rows)
```

Code đã có sẵn trong repo:
- `src/utils/supabaseSheetSync.js` — app đọc từ Supabase.
- `src/App.jsx` — tự động gọi Supabase trước, fallback qua CSV cũ nếu chưa
  có data (chỉ hữu ích cho sheet test còn public, không phải sheet nội bộ).
- `scripts/apps-script/sync-to-supabase.gs` — script cần cài **vào chính
  Google Sheet nguồn** (không nằm trong repo này khi chạy — Apps Script sống
  trong Google, không phải trong Git).
- Migration Supabase `create_sheet_sync_data` — đã tạo bảng `sheet_sync_data`
  (RLS: chỉ role `authenticated` được đọc; ghi chỉ qua `service_role`, không
  policy nào cho phép anon/authenticated ghi).

## Cài đặt (làm 1 lần, cần người có quyền edit Sheet)

1. Lấy **service_role secret key** trong Supabase Dashboard → chọn project
   *TTS Dashboard* (`iyjsihwgnzcytbojvoom`) → Project Settings → API →
   `service_role` secret. **Không đưa key này vào code/git** — nó có quyền
   ghi bỏ qua RLS.
2. Mở Google Sheet nguồn (spreadsheet ID
   `1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA`) → **Extensions → Apps
   Script**.
3. Xoá code mẫu, dán toàn bộ nội dung `scripts/apps-script/sync-to-supabase.gs`.
4. Trong Apps Script editor: **Project Settings** (icon bánh răng bên trái)
   → **Script Properties** → **Add script property**:
   - Property: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: (key lấy ở bước 1)
5. Quay lại tab **Editor**, chọn hàm `syncAllTabs` ở dropdown trên cùng →
   bấm **Run** một lần để cấp quyền (Authorize access — chọn tài khoản Google
   đang có quyền mở Sheet này, chấp nhận quyền đọc Sheet + gọi URL ngoài).
6. Kiểm tra **Executions** (icon đồng hồ, tab bên trái) không có lỗi, hoặc
   xem `Logger.log` trong View → Logs — sẽ thấy dòng
   `pick: đã đẩy N dòng lên Supabase.` cho cả 3 tab.
7. Cài lịch tự động: **Triggers** (icon đồng hồ khác, ⏰) → **Add Trigger**:
   - Choose which function to run: `syncAllTabs`
   - Event source: `Time-driven`
   - Type: `Minutes timer` → `Every 15 minutes` (điều chỉnh theo nhu cầu;
     15–30 phút là hợp lý cho báo cáo D-1)
   - Save.

Xong — từ giờ Apps Script tự chạy nền, app sẽ tự thấy data mới mỗi lần load
hoặc bấm "Sync Từ Supabase" trong modal Dev Admin → "Quản Lý Nguồn Dữ Liệu".

## Đổi tab hoặc sheet ID

`TAB_GIDS` trong file `.gs` khớp với `TAB_GIDS` trong
`src/utils/googleSheetsSync.js` (dùng `gid`, ổn định hơn tên tab). Nếu tab bị
xoá & tạo lại (đổi gid) hoặc đổi sang spreadsheet khác, sửa 2 nơi này cho
khớp.

## Debug khi app không thấy data mới

1. Vào Apps Script → **Executions** — xem lần chạy gần nhất có lỗi không.
2. Kiểm tra bảng `sheet_sync_data` trong Supabase Table Editor — cột
   `updated_at` có cập nhật gần đây không, `row_count` có đúng không.
3. Nếu Executions báo lỗi `SUPABASE_SERVICE_ROLE_KEY` chưa cấu hình → làm lại
   bước 4.
4. Nếu lỗi HTTP 401/403 từ Supabase → service_role key sai hoặc bị revoke —
   lấy lại key mới trong Supabase Dashboard.
