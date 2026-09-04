# Xử lý ưu tiên critique 04/09/2026

Nguồn: `.impeccable/critique/2026-09-04-user-journey.md` và `.assessment-b.md`.
Phạm vi: thay đổi local, giữ các chỉnh sửa có sẵn. Chưa commit/push/deploy.

## P1 đã xử lý

- Trust: bỏ dữ liệu mock lúc khởi tạo và reset; Report 1, Ca 1, Insight có trạng thái không có dữ liệu. Không còn NaN/NaN hay kết luận tất cả Hub đạt khi bỏ chọn vùng. Thông báo lỗi không khẳng định đã từng tải được dữ liệu. Refresh lỗi giữ dữ liệu đã tải trong phiên. Nguồn, khoảng ngày và phạm vi lọc hiển thị cùng báo cáo; nguồn CSV/Google Sheet/Supabase được phân biệt cả khi tải qua modal quản lý nguồn.
- Scope: lưu Client thực, report, vùng, loại Hub và density trong sessionStorage; query scope được ưu tiên. Lựa chọn rỗng không bị biến thành chọn tất cả sau refresh/sync. Ca 1 hiện không phân tách Client nên ẩn select Client ở tab này và ghi rõ giới hạn trên màn hình/file, không tự suy diễn tỷ trọng SPB/SPE.
- Export: chỉ Report 1/Ca 1 có CSV; vô hiệu hóa khi phạm vi rỗng. Có nút trong phần Bộ lọc mobile, thông báo đã tạo file, metadata Client/vùng/loại Hub/nguồn/khoảng dữ liệu trong CSV; escape dấu nháy và prefix công thức. Sửa tiêu đề cột đầu Report 1 thành Nghiệp vụ (giá trị Pickup/Deli, không phải Miền).

## P2 liên quan đã làm

- Tới D-1 trên mobile; tóm tắt phạm vi và đặt lại bộ lọc.
- Toolbar desktop/tablet xuống dòng theo nhóm; sticky offset đo theo chiều cao header thực tế.
- aria-current cho report đang chọn trên desktop/mobile; KPI tương tác dùng button; nút header mobile 44px.

## Kiểm chứng

- `npm.cmd test`: 33/33 (6 test mới về persistence, scope, coverage, CSV).
- `npm.cmd run build`: thành công; vẫn có cảnh báo chunk >500 kB.
- Lint các file thay đổi: không có error; còn 8 warning có sẵn ở Report 1 (unused imports/variable, effect dependencies).
- `git diff --check`: sạch sau sửa whitespace.
- Browser local Chromium, fixture riêng bằng route interception (không sửa Supabase, không giả làm production): desktop 1440px, tablet 1024px, mobile 390px, dark mode.
- Các luồng qua: bỏ hết vùng; bỏ hết loại Hub; refresh SPE/HNO; refresh report Ca 1; CSV desktop; CSV mobile Ca 1; D-1 hiện đủ; tab Leadtime không hiện CSV; lỗi sync có/không có dữ liệu trước đó. Không có uncaught runtime error; console error do timeout giả lập là dự kiến.
- Cột D-1 mobile: x=145.95–275.25 trong vùng nhìn thấy x=138.10–361.60; không tràn ngang toàn trang.
- CSV đã đọc lại: Report 1 120 dòng, chỉ SPE/HNO; Ca 1 30 dòng, metadata Không phân tách Client (nguồn Ca 1).
- Bằng chứng/kịch bản: `output/playwright/priority-check.cjs`, `priority-*.png`, `priority-report1.csv`, `priority-ca1.csv` (ignored, chỉ local).
- Vite watcher bỏ qua thư mục QA vì file download Windows từng gây EBUSY.

## Còn lại / giới hạn

- Chưa kiểm tra nguồn live có đăng nhập hoặc production. Không thay công thức KPI/RPC/DDL.
- Persistence hiện là bộ lọc toàn app trong phiên browser; bộ lọc riêng Leadtime (kỳ/lane/tuyến), metric con và expanded hubs chưa được lưu, chưa có saved views xuyên phiên.
- Chưa đóng toàn bộ P2/P3: trợ giúp KPI, dark-mode contrast các thành phần cũ, typography/ma trận, nhãn coverage 28 ngày Leadtime và accent-strip cũ còn cần lượt riêng. Không chấm lại heuristic hoặc tuyên bố toàn bộ critique đã sạch.
- Chưa có PRODUCT.md/DESIGN.md. Theo Impeccable, đợt này chỉ refinement theo hệ thống có sẵn, không đổi visual identity; có thể dùng init để ghi nhận hệ thống ở lượt sau.
