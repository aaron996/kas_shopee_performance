# Nợ kỹ thuật

Mỗi mục: hiện trạng, vì sao chưa làm, hướng làm. Cập nhật ngày ở đầu mục.

## 1. Xem KPI theo tuần (tối đa 8 tuần, mỗi tuần 2 cột: chỉ số và volume) — 09/10/2026

**Yêu cầu** (chị Quyên): trên dashboard có thêm tuỳ chọn xem theo tuần, tối đa 8
tuần, mỗi tuần hai cột (% và volume). Chưa làm; tạm dừng theo quyết định của chủ
repo, sẽ làm sau.

**Hiện trạng đã đo**

- Repo chưa có query theo tuần. Dashboard đọc dữ liệu theo ngày từ Sheet qua
  Supabase (`kas_pick_data`, `kas_deli_data`, `kas_fd_data`), mỗi dòng là một hub-ngày
  với tử số và mẫu số (`mau_*`, `ontime_*`), nên gộp tuần chỉ là cộng tử và mẫu rồi chia.
- Supabase chỉ giữ ~14 ngày (Pick/Deli/CA1 D-14..D-1, FD D-22..D-8), nên 8 tuần
  không lấy được từ dữ liệu hiện có.
- Luồng sync delta ([ops-incremental-sync.md](ops-incremental-sync.md)) **khoá cứng
  cửa sổ nguồn** (`opsDeltaValidateWindow_`): tab Pick có ngày ngoài D-14..D-1 sẽ bị
  từ chối và giữ nguyên snapshot cũ. Kéo dài tab daily sang 60 ngày vì vậy làm
  sync dừng, và dù bỏ guard thì dashboard cũng nặng gấp ~5 (≈150 nghìn dòng Pick;
  reader giới hạn 100 trang, timeout 15 giây).

**Kết quả thử** ([sql/pick_weekly_60d_test.sql](sql/pick_weekly_60d_test.sql), chạy trên
Superset StarRocks tại <https://data-query.ghn.vn/sqllab/>, đăng nhập SSO; output của
lần chạy không được lưu trong repo, muốn xem lại thì dán file SQL vào SQL Lab và chạy
lại, mất khoảng 1 phút): query Pick đổi range 60 ngày + cột `week_start =
date_trunc('week', …)` (thứ Hai, khớp tuần của app) chạy 33–57 giây, ra đủ 9 tuần
(10/8 → 5/10). Hai tuần trùng với `kas_pick_data` khớp tuyệt đối (mẫu, %1st, %OPR, mẫu
GXT, số hub). Bản thử bỏ `best_l6w_*` và `sameday_lm_*` vì hai nhóm này so theo 46
ngày và cùng ngày tháng trước, đổi range sẽ sai nghĩa.

**Thử Deli và FD (12/10)** ([sql/deli_weekly_60d_test.sql](sql/deli_weekly_60d_test.sql),
[sql/fd_weekly_60d_test.sql](sql/fd_weekly_60d_test.sql)): cửa sổ tuần nguyên, bắt đầu từ thứ
Hai cách 8 tuần trước tuần hiện tại (17/08), cùng bỏ nhóm benchmark. Deli chạy 44,7 giây,
8 tuần; FD chạy 28,5 giây, 7 tuần (kết thúc ở D-8). Hai tuần trùng với Supabase (28/09 và
05/10 với Deli, 21/09 và 28/09 với FD) khớp mẫu và tử, riêng `ontime_deli_1st` tuần 05/10
lệch 1 đơn (2.242.269 so với 2.242.270, khả năng do dữ liệu đổi giữa hai lần chạy). Query
Pick đổi sang cùng cửa sổ, chạy 32–59 giây, 8 tuần. Mốc quét `CreatedDate_Partition` nới 2
ngày làm tuần đầu (17/08) thiếu 12 đơn (2.044.103 so với 2.044.115); nới lên 7 ngày thì khớp
lại đúng. Khi đổi cửa sổ, đối chiếu tuần đầu trước.

**Quyết định đã chốt (12/10, chủ repo)**

- Phạm vi: 5 chỉ số là Pick (1st, OPR), Deli (1st, ODR) và FD. Leadtime để ngoài.
- Backfill một lần: tuần hiện tại + 8 tuần nguyên trước đó (từ thứ Hai 17/08 tại thời điểm
  này). FD kết thúc ở D-8.
- Sau đó mỗi lần sync chỉ giữ tuần hiện tại + 1 tuần nguyên trước đó (Pick, Deli); FD refresh
  tuần W-2 và W-3 (tuần liền trước không có dữ liệu vì FD không xuất 8 ngày gần nhất).
- Cần RPC upsert không xoá ngày ngoài cửa sổ, nếu không sync sẽ xoá phần backfill (xem
  [ops-incremental-sync.md](ops-incremental-sync.md)). Biểu đồ 60 ngày đọc qua RPC gộp theo
  ngày, không kéo hub-ngày về trình duyệt; cột benchmark rỗng ở các ngày backfill. Cần
  chính sách retention cho bảng dài hạn.

**Tiến độ (12/10)**: cả ba bảng lịch sử (Pick, Deli, FD), RPC đọc `get_kas_weekly_rows`, retention
(pg_cron, giữ 90 ngày) và toggle "Theo tuần" đã làm. Cả ba chỉ số đã backfill 8 tuần nguyên (17/08 → 11/10
với Pick, → 10/10 với Deli, → 04/10 với FD) và khớp Superset. Sync hằng ngày đã móc cho Pick/Deli/FD (chưa có
lần chạy thật sau khi móc, cần kiểm tra sau lần 08:30 kế tiếp). Còn lại: xoá các tab `deli_backfill_tmp`,
`fd_backfill_tmp` và xem thử toggle trên giao diện có đăng nhập. Xem [ops-history-sync.md](ops-history-sync.md).

**Hướng làm đề xuất**: tab weekly riêng, không kéo dài tab daily

1. BI thêm tab Sheet mới (pick/deli/fd weekly, khoảng 10 nghìn dòng mỗi tab), bắt đầu
   từ `week_start`; 8 tuần đầy đủ + tuần hiện tại (WTD). FD lệch theo độ trễ như phần
   FD hiện tại, không cắt theo tuần lịch.
2. Thêm case weekly vào `ops_kpi_sync_spec` (RPC) và cửa sổ validate riêng; delta
   sync phù hợp vì tuần đã chốt gần như không đổi, mỗi lần chỉ gửi tuần hiện tại và
   có thể tuần trước (dữ liệu về muộn).
3. Bảng `kas_*_weekly_data` riêng; dashboard chỉ đọc khi bật chế độ theo tuần.
4. Frontend: toggle "Theo ngày / Theo tuần" trong `Report1MienVungHub`, dùng
   `week_start` thay `dateList`; 16 cột cần cuộn ngang hoặc ghim cột tên.

Lưu ý: SQL và Apps Script không tự áp dụng từ Git, phải áp dụng tay như lần 09/10.
Cần xác nhận lại GXT theo Miền (xem [gxt-mien-region.md](gxt-mien-region.md)) trong
dữ liệu weekly: tuần 10/8 có 27 đơn mẫu GXT với `region` rỗng.

## 2. RPC chat chưa có logic CK — 09/10/2026

`get_ai_chat_metric` mới xử lý KA và GXT, chưa tách kho CK sang `HCM - CK` /
`HNO - CK` và đổi hub type `CK` như `reassignKaRegion` ở dashboard (CK theo tên
chứa "CK" hoặc danh sách `wh_id`). Chat vì vậy tính CK theo vùng gốc. Cần migration
riêng; phần danh sách `wh_id` cần đồng bộ từ `dataProcessor.js`.
