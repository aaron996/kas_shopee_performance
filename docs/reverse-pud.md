# PUD của SPE Reverse

PUD dùng `SUM(pud) / SUM(mau_pud) × 100%`, với mẫu riêng ở cột J của tab `reverse`.
Không dùng `mau_pu`, không lấy trung bình tỷ lệ giữa các hub/ngày và chưa gán target.
Các dòng có `mau_pu = 0` vẫn có thể có mẫu PUD.

## Luồng dữ liệu

- File Apps Script `reverse-history-sync.gs`: `REVERSE_COLUMNS` nhận cả `pud` và `mau_pud` theo tên header, không theo vị trí.
- Migration `20261102035351_reverse_pud_denominator.sql` thêm cột nullable `mau_pud` vào `public.kas_reverse_history` và mở rộng hàm replace cùng ba RPC compact theo ngày/tuần/export. Bảng không partition (đã kiểm tra catalog live); cửa sổ ngày dùng `report_date`.
- Bảng và quyền truy cập giữ nguyên: bảng chỉ service role, các RPC đọc cho authenticated/service role. Không mở thêm quyền anon.
- Script vẫn replace D-14..D-1 trong một transaction; không tạo lại hay đổi lịch trigger. Writer cũ thiếu khóa `mau_pud` được nhận khi cửa sổ chưa có mẫu mới; sau khi có mẫu mới, RPC từ chối writer cũ để tránh xóa mẫu đã biết.

## App

Chọn **SPE Reverse → Chi tiết Vùng/Hub → PUD**, cạnh 1st Pickup/OPR.
Ngày mặc định dùng dữ liệu Reverse đã tải; ngày tùy chọn và tuần dùng RPC lịch sử.
Các bảng cộng tử/mẫu theo Toàn quốc → Miền → Vùng → Hub và hiển thị cột **Mẫu PUD**.
PUD không xuất hiện cho SPB/SPE. Overview và BXH chưa bổ sung KPI PUD.

Mẫu bằng 0 hoặc thiếu tử/mẫu hiển thị dấu **–**. Nếu một nhóm ngày/tuần chứa dòng thiếu mẫu,
cả tỷ lệ tổng hợp của nhóm đó hiển thị **–**, tránh lấy tỷ lệ trên phần mẫu đã biết.
Lịch sử trước 19/10/2026 chưa được backfill mẫu mới. Không suy mẫu từ `mau_pu` hay điền 0.
Query mẫu Reverse cũ trong `docs/sql` chưa có `mau_pud`; không dùng chúng để ghi đè nguồn PUD mới.

Dòng Reverse trống vùng được giữ trong tổng toàn quốc khi chọn tất cả vùng, nằm dưới
**Miền Khác / Chưa rõ vùng**. Chọn vùng cụ thể sẽ loại các dòng chưa rõ vùng; không tự đoán vùng theo tên hub.

Nguồn Reverse có trạng thái loading/error/retry độc lập. Refresh giữ dữ liệu đã có.
Export mở trên tab PUD mặc định chọn PUD; CSV ghi tỷ lệ thiếu mẫu là **–**.
Mở hộp thoại hoặc đổi bộ lọc không gọi DB. Chỉ khi tải CSV mới đọc lịch sử nếu cần,
và tải lần lượt các dataset đã chọn.

## Kiểm tra và vận hành ngày 02/11/2026

- Đã áp dụng migration trên project `iyjsihwgnzcytbojvoom`.
- Đã lưu mapping mới trong file Reverse của project Apps Script `auto` và chạy `syncReverseHistory()` thành công.
- Cửa sổ 19/10–01/11: 16.269 dòng, tất cả có `mau_pud`; tổng `pud` 46.847, tổng mẫu 196.246.
  Có 1.864 dòng `mau_pu = 0` nhưng `mau_pud > 0` và 629 dòng thiếu vùng.
- Ngày 01/11, trước bộ lọc: 1.215 dòng, PUD 2.840 / 18.126 = 15,6681%; UI làm tròn 15,7%.
- Local UI dùng dữ liệu RPC thật ngày 01/11; CSV PUD đã tải qua iab. Browser QA chỉ dùng iab.
- Kiểm tra chính: `npm test`, `npm run test:loading`, `npm run build`,
  `node --test scripts/apps-script/reverse-history-sync.test.mjs`.
- Backend additive tương thích app cũ. Bản app mới cần được merge/deploy trước khi tab PUD xuất hiện trên production.
