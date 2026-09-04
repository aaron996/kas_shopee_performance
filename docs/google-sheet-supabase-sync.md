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
người sở hữu/đang mở file (không phải "public"), tự đẩy dữ liệu 4 tab
(Pick / Deli / Ca1 / Leadtime) vào 4 bảng quan hệ bình thường trên Supabase theo lịch —
mỗi dòng sheet là 1 dòng SQL, không phải 1 blob JSON — để dữ liệu này còn
dùng SQL query/join cho các việc khác ngoài app này. App đọc dữ liệu từ
Supabase (project đã dùng sẵn cho auth) thay vì đọc trực tiếp Google Sheet.

```
Google Sheet (Apps Script, quyền owner)
        │  UrlFetchApp.fetch() mỗi 15' — không phụ thuộc share settings
        │  POST /rest/v1/rpc/sync_kas_<tab>_data  (full-refresh atomic)
        ▼
Supabase tables: kas_pick_data / kas_deli_data / kas_ca1_data / kas_leadtime_data
        (service_role ghi qua RPC, authenticated đọc)
        │  supabase-js (anon key + user session)
        ▼
App (src/utils/supabaseSheetSync.js) → App.jsx state (pickRows/deliRows/ca1Rows/leadtimeRows)
```

Mỗi tab có 1 hàm SQL full-refresh riêng: `sync_kas_pick_data(payload jsonb)`,
`sync_kas_deli_data(payload jsonb)`, `sync_kas_ca1_data(payload jsonb)`,
`sync_kas_leadtime_data(payload jsonb)` —
mỗi lần gọi sẽ **xoá hết + insert lại** dữ liệu bảng đó trong 1 transaction.
Không upsert theo key vì kiểm tra thực tế cho thấy data sheet không có cột
nào là unique key tự nhiên (vd `report_date+hub+client_name` hay
`ngay+lane+vung_giao` đều có thể trùng).

Code đã có sẵn trong repo:
- `src/utils/supabaseSheetSync.js` — app đọc từ các bảng Supabase (`select *`
  mỗi bảng), format ra đúng shape mà `App.jsx` đang cần.
- `src/App.jsx` — tự động gọi Supabase trước, fallback qua CSV cũ nếu chưa
  có data (chỉ hữu ích cho sheet test còn public, không phải sheet nội bộ).
- `scripts/apps-script/sync-to-supabase.gs` — script cần cài **vào chính
  Google Sheet nguồn** (không nằm trong repo này khi chạy — Apps Script sống
  trong Google, không phải trong Git).
- Migration Supabase `20260820_create_kas_leadtime_data.sql` — tạo bảng
  `kas_leadtime_data` + hàm RPC `sync_kas_leadtime_data`. RLS: role `authenticated`
  được `SELECT`; ghi chỉ qua các hàm RPC (`security definer`, quyền `EXECUTE`
  chỉ cấp cho `service_role`).

## Tần suất chạy: 1 lần/ngày sau 8h30, không phải mỗi 15 phút

Bản đầu chạy mỗi 15 phút cả ngày (full delete+insert 4 bảng mỗi lần) — quá
tải ghi (disk I/O) cho compute tier nhỏ của Supabase khi chạy liên tục.
BI chỉ đổ data về Sheet 1 lần/ngày lúc 8h15, nên **không cần sync nhiều hơn
1 lần/ngày**. Bản `.gs` hiện tại:

- Chỉ tạo **1 trigger/ngày**, ghim gần giờ `MIN_RUN_HOUR:MIN_RUN_MINUTE`
  (mặc định 8:30, đổi ở đầu file `.gs` nếu cần) bằng `createDailyTrigger()` —
  xem bước 5 bên dưới. KHÔNG tạo trigger qua UI (Triggers > Add Trigger) kiểu
  "Day timer, 8am to 9am": UI đó chỉ hứa chạy đâu đó TRONG khung giờ, có thể
  rơi vào 8:01AM — trước khi BI kịp đổ data.
- Có thêm chốt chặn NGAY TRONG code (`isBeforeRunWindow_`): nếu hàm
  `syncAllTabs` vì lý do gì đó chạy trước `MIN_RUN_HOUR:MIN_RUN_MINUTE` (kể
  cả bấm Run tay để test), nó tự bỏ qua thay vì đẩy data cũ/thiếu lên
  Supabase — log lại lý do bỏ qua trong Executions, không báo lỗi.

## Cài đặt / cập nhật (cần người có quyền edit Sheet)

> Nếu bạn đã cài bản cũ rồi — chỉ cần **dán lại code `.gs` mới**
> (bước 3 dưới) vào đúng project Apps Script đã tạo, RỒI CHẠY LẠI
> `createDailyTrigger` (bước 5) một lần để thay trigger cũ (mỗi 15 phút)
> bằng trigger mới (1 lần/ngày) — không cần tạo lại Script Property.

1. Lấy **service_role secret key** trong Supabase Dashboard → chọn project
   *TTS Dashboard* (`iyjsihwgnzcytbojvoom`) → Project Settings → API →
   `service_role` secret. **Không đưa key này vào code/git** — nó có quyền
   ghi bỏ qua RLS. (Nếu đã làm bước này ở lần cài trước, không cần lại.)
2. Mở Google Sheet nguồn (spreadsheet ID
   `1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA`) → **Extensions → Apps
   Script**.
3. Xoá code cũ, dán toàn bộ nội dung mới nhất của
   `scripts/apps-script/sync-to-supabase.gs`.
4. (Chỉ cần nếu chưa làm) Trong Apps Script editor: **Project Settings**
   (icon bánh răng bên trái) → **Script Properties** → **Add script
   property**:
   - Property: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: (key lấy ở bước 1)
5. Quay lại tab **Editor**, chọn hàm `syncAllTabs` ở dropdown trên cùng →
   bấm **Run** một lần (nếu là lần đầu sẽ cần cấp quyền / Authorize access —
   chọn tài khoản Google đang có quyền mở Sheet này, chấp nhận quyền đọc
   Sheet + gọi URL ngoài).
6. Kiểm tra **Executions** (icon đồng hồ, tab bên trái) không có lỗi, hoặc
   xem `Logger.log` trong View → Logs — sẽ thấy dòng
   `pick: đã đẩy N dòng lên Supabase (bảng kas_pick_data).` cho các tab.
7. Cài lịch tự động: chọn hàm `createDailyTrigger` ở dropdown trên cùng →
   bấm **Run** một lần. Hàm này tự xoá mọi trigger cũ của `syncAllTabs`
   (kể cả trigger "Every 15 minutes" tạo qua UI ở bản trước) rồi tạo 1
   trigger mới chạy 1 lần/ngày, gần giờ `MIN_RUN_HOUR:MIN_RUN_MINUTE` (mặc
   định 8:30, xem đầu file `.gs`). Không cần vào tab **Triggers** ⏰ để tạo
   tay — chỉ dùng tab đó để **xem lại** trigger đã tạo đúng chưa.
   - Muốn đổi giờ chạy: sửa `MIN_RUN_HOUR`/`MIN_RUN_MINUTE` đầu file `.gs`,
     lưu, rồi chạy lại `createDailyTrigger` để áp dụng.

Xong — từ giờ Apps Script tự chạy nền 1 lần/ngày, app sẽ tự thấy data mới
mỗi lần load hoặc bấm "Sync Từ Supabase" trong modal Dev Admin → "Quản Lý
Nguồn Dữ Liệu".

## Debug khi app không thấy data mới

1. Vào Apps Script → **Executions** — xem lần chạy gần nhất có lỗi không.
   Một dòng log "Bỏ qua lần chạy này: mới HH:mm, còn trước 8:30" là **bình
   thường**, không phải lỗi — đó là chốt chặn giờ chạy hoạt động đúng.
2. Kiểm tra các bảng `kas_pick_data` / `kas_deli_data` / `kas_ca1_data` / `kas_leadtime_data` trong
   Supabase Table Editor — cột `synced_at` có cập nhật gần đây không, số
   dòng có hợp lý không.
3. Nếu Executions báo lỗi `SUPABASE_SERVICE_ROLE_KEY` chưa cấu hình → làm lại
   bước 4 ở trên.
4. Nếu lỗi HTTP 401/403 từ Supabase → service_role key sai hoặc bị revoke —
   lấy lại key mới trong Supabase Dashboard.
5. Nếu lỗi HTTP 404 ở `/rest/v1/rpc/sync_kas_...` → project Supabase chưa có
   migration `create_kas_leadtime_data` hoặc các hàm sync tương ứng.
