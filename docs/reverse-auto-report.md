# Báo cáo tự động SPE Reverse (Telegram)

Báo cáo hằng ngày cho team KA, gửi vào group Telegram bằng ảnh chụp của trang `/snapshot` (cùng luồng với
[n8n-snapshot.md](n8n-snapshot.md)). Cấu trúc theo file mẫu KA gửi (4 bảng, % PUD theo ngày + gán lấy theo kho BC KD), chia thành 3 ảnh:

| `report=reverse&table=` | Nội dung |
| --- | --- |
| `pud` | **% Pickup done (PUD)** 7 ngày gần nhất, 3 bảng: theo loại Hub (AHM, BC, BC KD, GXT, KHL), BC KD theo tỉnh, Nationwide theo vùng; mỗi bảng có dòng Tổng |
| `vol` | Vol (đơn mới/ngày) 7 ngày gần nhất, cùng 3 bảng |
| `backlog` | **Gán lấy** BC KD theo kho (đội pick): đủ mọi kho, cột 0 / 1–2 / ≥3 lần gán (đơn tồn ≤ 7 ngày = L7D), L7D và L14D, dòng Tổng |

```
https://kas-shopee-performance.vercel.app/snapshot?report=reverse&table=pud&token=<token>
```

Token lấy ở `POST /api/snapshot-token` như các ảnh khác. Không cần `client`: Reverse luôn là `SPE Reverse`.

## Nguồn và cách tính

- **% PUD / vol**: bảng `kas_reverse_history` (datajob `data_job_daily_reverse`, tab `reverse` → Apps Script `syncReverseHistory`).
  % PUD = `pud / mau_pu` (định nghĩa PUD của app, #265), **không chặn 100%**: `pud` gồm cả đơn tồn từ ngày trước được lấy trong ngày.
  Vol = `mau_pu`. Dữ liệu tính đến D-1; ảnh lấy 7 ngày mới nhất có trong bảng.
- **Backlog BCKD**: snapshot mới nhất của `kas_reverse_backlog` (datajob `data_job_daily_reverse_backlog`, tab `reverse_backlog` →
  `syncReverseBacklog`). Bucket gán lấy giữ nguyên của job: `0 / 1-2 / 3+`. L7D = tuổi tồn `1-3` + `4-7`; L14D = cả cửa sổ.
- Mỗi bảng % PUD/vol có Tổng riêng từ các dòng nguồn của bảng đó. Vùng, KHL, CK, GXT đi qua
  `normalizeDashboardRows` như dashboard; GXT, KHL và đơn chưa rõ vùng gộp vào dòng "Khác" của bảng vùng. Tỉnh của BC KD lấy từ mã trong tên kho (`(HNO) KD …` → Hà Nội, `PROVINCE_BY_CODE`), mã lạ hiện nguyên mã. BCKD của backlog nhận theo `hub_type = KD` (job tự gắn), kho KHL theo `wh_id`.
- **Tên kho**: backlog chỉ có `wh_id`; tên lấy từ `kas_reverse_history.hub` theo `wh_id` (cột mới, migration
  `20261120090000_kas_reverse_history_wh_id.sql`). Chưa có tên thì hiện `Kho <wh_id>`.
- Logic nằm ở `src/utils/reverseAutoReport.js` (test: `reverseAutoReport.test.mjs`), vẽ ở `src/modules/auto-report/`,
  đọc dữ liệu ở `fetchReverseSnapshot` (`server/snapshot/data.js`, service role).

## Triển khai

1. Chạy migration `20261120090000_kas_reverse_history_wh_id.sql`.
2. Dán lại `reverse-history-sync.gs` (gửi thêm `wh_id`). Các dòng cũ có `wh_id = null` cho tới khi sync hằng ngày ghi lại cửa sổ
   14 ngày; tên kho chỉ cần ngày mới nhất nên đủ ngay sau lần sync đầu.
3. n8n: thêm ba URL vào danh sách bảng cần chụp (như 9 bảng của Pick/Deli) rồi gửi ảnh vào group.

## Lịch chạy (kiểm tra ngày 20/11/2026)

| Bước | Lịch |
| --- | --- |
| `data_job_daily_reverse` (#967) | Daily 05:50 trên ai-portal; lần chạy cuối ghi 11:47 ICT ngày 20/11 dù lịch 05:50, chưa rõ vì sao |
| `data_job_daily_reverse_backlog` (#1004) | **Manual only**, lần chạy cuối ghi 11/11, trạng thái Running |
| Apps Script `syncReverseHistory` | trigger ~09:00 (`REVERSE_TRIGGER_HOUR`) |
| Apps Script `syncReverseBacklog` | trigger ~09:15 |

"09:00 / 09:15" là giờ trigger Apps Script (phía đồng bộ sang Supabase), không phải giờ chạy của datajob. Số `synced_at` trên Supabase:
snapshot backlog 19/11 ghi lúc 09:17 ngày 20/11, còn lịch sử và snapshot 20/11 ghi lúc 10:23 ngày 20/11 (có vẻ chạy tay).
Datajob backlog đang manual mà vẫn có snapshot hằng ngày trên Supabase, nên chưa rõ ai làm mới tab `reverse_backlog`.

Khuyến nghị: đặt lịch hằng ngày cho #1004 (sau #967), và đặt cron n8n sau giờ trigger Apps Script (≥ 09:30). Hai Apps Script từ chối
ghi khi nguồn cũ (lịch sử phải đủ đến hôm qua, backlog phải là snapshot hôm nay hoặc hôm qua), nên dữ liệu cũ không lọt vào ảnh. Ảnh
backlog ghi rõ ngày snapshot ở tiêu đề để nhìn là biết có tươi hay không.

## Kiểm tra chênh lệch giữa hai job (20/11/2026)

So backlog snapshot 20/11 với số đơn chưa lấy (`mau_pud − pud`) của lịch sử ngày 19/11: BC KD 2.334 so với 2.215 (+5%), GXT 15/15, KHL 19/19;
các kho BC KD lớn lệch dưới 7 đơn. Nguyên nhân còn là giả thuyết (job backlog tính cả `picking`, tính theo `CreatedDate` thay vì
`loaddate_final`, chụp ngày 20/11 thay vì cuối ngày 19/11). Vì vậy bảng gán lấy và backlog tuyệt đối đều lấy từ job backlog.

## Tab "Báo cáo tự động" (app)

Module `auto-report` (sidebar, nhóm Operation insights, ngay dưới "Đơn nghi vấn COD", `requiresAuth`) hiển thị lại đúng ba bảng của ảnh Telegram.
- Dữ liệu: `GET /api/snapshot-summary?view=reverse-report` với `Authorization: Bearer <phiên đăng nhập>` (không dùng token snapshot). Cùng payload
  `{ history, backlog }` như `/snapshot`; dựng mô hình ở `src/utils/reverseReportClient.js`. Hai bảng gốc chỉ có quyền service_role nên phải qua endpoint.
  Gộp vào `snapshot-summary` để giữ `api/` dưới giới hạn 12 function của Vercel Hobby.
- Không có `requiredDatasets` (không dùng dataset chung); tab tự giữ trạng thái chờ: skeleton `LoadingScreen` ngay từ render đầu, giữ dữ liệu cũ khi tải lại,
  báo lỗi + "Thử lại". Chỉ hiện "Chưa có …" sau khi tải xong mà thật sự rỗng.
- Header ẩn Client/Vùng/Loại Hub và CSV qua `scopeSupport.js` (`SCOPE_FILTERLESS_TABS`). Bảng riêng, không dùng `KpiMatrixTable`: xem ngoại lệ trong `DESIGN.md`.

## Khác biệt so với file mẫu KA (chưa xử lý được)

- **Con số**: % PUD của mẫu (khoảng 30–45% giai đoạn 30/10–05/11) không tái hiện được từ `kas_reverse_history`: `pud/mau_pu` ra 58–85%,
  `pud/mau_pud` ra 15–22% cùng ngày. Báo cáo dùng định nghĩa PUD hiện hành của app (`pud/mau_pu`). Cần xác nhận mẫu số với KA.
- **Gán lấy**: job backlog chỉ có nhóm `0 / 1-2 / 3+`, mẫu của KA tách 0 / 1 / 2 / 3.
