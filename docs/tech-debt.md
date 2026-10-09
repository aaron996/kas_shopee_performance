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
Superset StarRocks): query Pick đổi range 60 ngày + cột `week_start =
date_trunc('week', …)` (thứ Hai, khớp tuần của app) chạy 33–57 giây, ra đủ 9 tuần
(10/8 → 5/10). Hai tuần trùng với `kas_pick_data` khớp tuyệt đối (mẫu, %1st, %OPR, mẫu
GXT, số hub). Bản thử bỏ `best_l6w_*` và `sameday_lm_*` vì hai nhóm này so theo 46
ngày và cùng ngày tháng trước, đổi range sẽ sai nghĩa.

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
