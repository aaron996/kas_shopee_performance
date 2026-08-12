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
(Pick / Deli / Ca1) vào 3 bảng quan hệ bình thường trên Supabase theo lịch —
mỗi dòng sheet là 1 dòng SQL, không phải 1 blob JSON — để dữ liệu này còn
dùng SQL query/join cho các việc khác ngoài app này. App đọc dữ liệu từ
Supabase (project đã dùng sẵn cho auth) thay vì đọc trực tiếp Google Sheet.

```
Google Sheet (Apps Script, quyền owner)
        │  UrlFetchApp.fetch() mỗi 15' — không phụ thuộc share settings
        │  POST /rest/v1/rpc/sync_kas_<tab>_data  (full-refresh atomic)
        ▼
Supabase tables: kas_pick_data / kas_deli_data / kas_ca1_data
        (service_role ghi qua RPC, authenticated đọc)
        │  supabase-js (anon key + user session)
        ▼
App (src/utils/supabaseSheetSync.js) → App.jsx state (pickRows/deliRows/ca1Rows)
```

Mỗi tab có 1 hàm SQL full-refresh riêng: `sync_kas_pick_data(payload jsonb)`,
`sync_kas_deli_data(payload jsonb)`, `sync_kas_ca1_data(payload jsonb)` —
mỗi lần gọi sẽ **xoá hết + insert lại** dữ liệu bảng đó trong 1 transaction.
Không upsert theo key vì kiểm tra thực tế cho thấy data sheet không có cột
nào là unique key tự nhiên (vd `report_date+hub+client_name` hay
`ngay+lane+vung_giao` đều có thể trùng).

Code đã có sẵn trong repo:
- `src/utils/supabaseSheetSync.js` — app đọc từ 3 bảng Supabase (`select *`
  mỗi bảng), format ra đúng shape mà `App.jsx` đang cần.
- `src/App.jsx` — tự động gọi Supabase trước, fallback qua CSV cũ nếu chưa
  có data (chỉ hữu ích cho sheet test còn public, không phải sheet nội bộ).
- `scripts/apps-script/sync-to-supabase.gs` — script cần cài **vào chính
  Google Sheet nguồn** (không nằm trong repo này khi chạy — Apps Script sống
  trong Google, không phải trong Git).
- Migration Supabase `create_kas_normalized_tables` — tạo 3 bảng
  `kas_pick_data` / `kas_deli_data` / `kas_ca1_data` + 3 hàm RPC
  `sync_kas_*_data`. RLS: role `authenticated` được `SELECT`; ghi chỉ qua
  các hàm RPC (`security definer`, quyền `EXECUTE` chỉ cấp cho
  `service_role` — đã tự tay revoke lại khỏi `anon`/`authenticated` vì
  Supabase mặc định tự cấp EXECUTE cho 2 role đó khi tạo function mới, xem
  migration `lock_down_sync_functions_execute`).

## Cài đặt / cập nhật (cần người có quyền edit Sheet)

> Nếu bạn đã cài bản cũ (ghi vào bảng `sheet_sync_data`) rồi — bảng đó đã bị
> `DROP` khi chuyển sang bảng quan hệ. Chỉ cần **dán lại code `.gs` mới**
> (bước 3 dưới) vào đúng project Apps Script đã tạo — không cần tạo lại
> Script Property hay Trigger, cứ giữ nguyên, chỉ thay nội dung code.

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
   `pick: đã đẩy N dòng lên Supabase (bảng kas_pick_data).` cho cả 3 tab.
7. (Chỉ cần nếu chưa làm) Cài lịch tự động: **Triggers** (icon đồng hồ khác,
   ⏰) → **Add Trigger**:
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

## Dùng data này cho việc khác (SQL trực tiếp)

Vì data giờ là bảng quan hệ bình thường, có thể query/join trực tiếp bằng
SQL trong Supabase (Table Editor, SQL Editor, hoặc bất kỳ tool nào kết nối
Postgres qua connection string của project). Ví dụ:

```sql
select region, hub, avg(ontime_pu_1st::numeric / mau_pu) as p1st_rate
from kas_pick_data
where report_date >= current_date - interval '7 days'
group by region, hub
order by p1st_rate asc;
```

Lưu ý: mỗi lần Apps Script chạy, bảng bị **xoá hết rồi insert lại** (không
phải append) — nên bảng này chỉ giữ snapshot **mới nhất** của sheet, không
tích lũy lịch sử qua các lần sync. Nếu cần giữ lịch sử lâu dài (khác với dữ
liệu nhiều ngày sẵn có trong sheet ở mỗi lần snapshot), cần thêm bảng lưu
trữ riêng — chưa nằm trong phạm vi thay đổi này.

## Debug khi app không thấy data mới

1. Vào Apps Script → **Executions** — xem lần chạy gần nhất có lỗi không.
2. Kiểm tra 3 bảng `kas_pick_data` / `kas_deli_data` / `kas_ca1_data` trong
   Supabase Table Editor — cột `synced_at` có cập nhật gần đây không, số
   dòng có hợp lý không.
3. Nếu Executions báo lỗi `SUPABASE_SERVICE_ROLE_KEY` chưa cấu hình → làm lại
   bước 4 ở trên.
4. Nếu lỗi HTTP 401/403 từ Supabase → service_role key sai hoặc bị revoke —
   lấy lại key mới trong Supabase Dashboard.
5. Nếu lỗi HTTP 404 ở `/rest/v1/rpc/sync_kas_...` → project Supabase chưa có
   migration `create_kas_normalized_tables`, hoặc gõ sai tên hàm.
