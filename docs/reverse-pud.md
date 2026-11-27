# PUD của SPE Reverse

PUD dùng `SUM(pud) / SUM(mau_pud) × 100%`, với mẫu riêng ở cột J của tab `reverse`.
Không dùng `mau_pu`, không lấy trung bình tỷ lệ giữa các hub/ngày và chưa gán target.
Các dòng có `mau_pu = 0` vẫn có thể có mẫu PUD.

> **Cập nhật 12/11/2026:** theo #265, PUD hiện = `SUM(pud) / SUM(mau_pu)` (không dùng `mau_pud`; `mau_pud` chỉ dùng cho tab Backlog).
> `pud` không phải tập con của `mau_pu` (11/11: 268/1.275 dòng có `pud > mau_pu`), nên không còn ràng buộc `pud <= mau_pu`;
> chỉ giá trị thiếu/âm mới là "–". Tỷ lệ một hub có thể vượt 100%. Các đoạn bên dưới nói về mẫu riêng `mau_pud` là mô tả cũ.

> **Cập nhật 27/11/2026 (team KA):** PUD tính theo **ngày hẹn lấy** như 1st Pickup/OPR: `SUM(pud) / SUM(mau_pu)`.
> Một ngày thử `mau_pud` = đơn tạo trong ngày (#289) đã được hoàn lại. Nguồn là `docs/sql/pick_reverse_14d.sql` (datajob hằng ngày):
> `pud` = đơn trong pool (hẹn lấy <= ngày d, trong 14 ngày, còn mở đầu ngày d) đã lấy tới hết ngày d, `mau_pud` = `COUNT(*)` của pool
> chỉ dùng cho tab Backlog. Lịch sử 01/10–12/11 được ghi lại bằng `docs/sql/pick_reverse_backfill_20261001.sql`.

## Luồng dữ liệu

- File Apps Script `reverse-history-sync.gs`: `REVERSE_COLUMNS` nhận cả `pud` và `mau_pud` theo tên header, không theo vị trí.
- Migration `20261102035351_reverse_pud_denominator.sql` thêm cột nullable `mau_pud` vào `public.kas_reverse_history` và mở rộng hàm replace cùng ba RPC compact theo ngày/tuần/export. Bảng không partition (đã kiểm tra catalog live); cửa sổ ngày dùng `report_date`.
- Bảng và quyền truy cập giữ nguyên: bảng chỉ service role, các RPC đọc cho authenticated/service role. Không mở thêm quyền anon.
- Luồng hiện tại upsert D-14..D-1 trong một transaction: khóa mới được thêm, khóa trùng được cập nhật số mới, dòng không còn trên sheet vẫn được giữ. Chạy lại dữ liệu không đổi không ghi lại timestamp. Không tạo lại hay đổi lịch trigger.
- Migration `20261102043310_reverse_history_upsert.sql` bổ sung `upsert_kas_reverse_history`; tên RPC cũ `replace_kas_reverse_history` chuyển tiếp sang cùng hàm upsert để script đã triển khai cũng không còn xóa cửa sổ dữ liệu. Writer thiếu khóa `mau_pud` vẫn bị chặn nếu có nguy cơ xóa mẫu đã biết.

## App

Chọn **SPE Reverse → Chi tiết Vùng/Hub → PUD**, cạnh 1st Pickup/OPR.
Ngày mặc định dùng dữ liệu Reverse đã tải; ngày tùy chọn và tuần dùng RPC lịch sử.
Các bảng cộng tử/mẫu theo Toàn quốc → Miền → Vùng → Hub và hiển thị mẫu PUD ở cột volume.
Ở chế độ ngày mặc định, PUD dùng cùng renderer với 1st Pickup/OPR: toolbar, Copy ảnh,
cột nhóm tuần, D-1/WTD, hàng cố định, mở rộng Hub và animation dùng chung. Volume là mẫu PUD.
Các cột benchmark chưa có nguồn hiển thị dấu –. Ngày tùy chọn/tuần vẫn dùng bảng lịch sử chung của các KPI.
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

## Thay đổi luồng ghi ngày 02/11/2026

Theo yêu cầu mới, Reverse dùng upsert thay cho replace cửa sổ. Khóa là
`(report_date, region, hub, hub_type, client_name)`; NULL trong khóa được đối chiếu bằng unique constraint `NULLS NOT DISTINCT`.
Các số `mau_pu`, `ontime_pu_1st`, `ontime_pu_opr`, `pud`, `mau_pud` được ghi đè từ nguồn khi thay đổi.
Không cộng dồn các số của dòng trùng và không xóa dòng vắng mặt trong lần đồng bộ mới.

Các mô tả replace và số dòng xóa ở phần kiểm tra trước đó là kết quả của lần chạy trước khi đổi luồng.
Mã script trong repo gọi RPC upsert mới. Script đang triển khai vẫn có thể gọi tên RPC cũ;
wrapper ở database đảm bảo hành vi upsert cho cả hai tên.

## Chatbot trong app và MCP
`metric = 'pud'` có trong `get_metric_summary`, `get_latest_metric_summary`, `get_metric_trend`, `get_metric_change_drivers`, chỉ cho client SPE Reverse (client khác báo "PUD chỉ có cho client SPE Reverse", không đọc DB). Công thức theo dashboard: `sum(pud) / sum(mau_pu) × 100`, chưa có target, có thể > 100% vì `pud` không là tập con của `mau_pu`. Đọc từ `kas_reverse_history` qua `get_kas_daily_range_compact` (`server/chat/reverse-data.js`). Lọc/nhóm theo Tỉnh thành hoặc Lane chưa hỗ trợ cho PUD (RPC `get_kas_detail_summary` chưa trả cột `pud`). Test: `server/chat/pud-metric.test.mjs`.
