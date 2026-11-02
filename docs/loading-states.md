# Trạng thái chờ dữ liệu

Đây là quy tắc bắt buộc của design system; xem mục “Loading, empty and error states” trong [DESIGN.md](../DESIGN.md). Không dùng “chưa có dữ liệu” làm giao diện chờ.

Có đúng hai thứ người dùng thấy khi app chờ dữ liệu:

1. **Intro thương hiệu** (`BrandSplash`) trong lúc sync live đầu tiên của mỗi lần
   mở/reload app. Có nút "Bỏ qua". Xem [brand-video.md](brand-video.md).
2. **Skeleton** (`LoadingScreen`) ở mọi tab/khu vực chưa có số: khung giả có hình
   dạng của nội dung sắp về, một vệt sáng chạy chậm qua tất cả các khối.

Đã bỏ (đừng thêm lại): thanh tiến độ mỏng trên cùng (`sync-progress-bar`), icon
đồng bộ xoay ở Header (xoay lệch tâm vì quay cả `<svg>` của icon động), sprite
người chạy (`loading_sprite.jpg`) và overlay mờ che cả màn hình.

## `LoadingScreen`

| Biến thể | Dùng ở | Nội dung |
|---|---|---|
| `variant="page"` | Module đang chờ nguồn và fallback `Suspense` (`ModuleSurfaceOutlet.jsx`); vùng KPI Tổng quan đang chờ (`Report1MienVungHub.jsx`) | 4 ô KPI + biểu đồ + bảng 7 dòng |
| `variant="block"` (mặc định) | Thẻ/khu vực nhỏ: danh sách COD, bằng chứng SMS, màn Dev Admin | tiêu đề + bảng 4 dòng |

| `variant="inline"` | Giá trị KPI/MTD, ô thống kê và trạng thái tìm kiếm nhỏ | một thanh skeleton, cùng màu và hiệu ứng |

- Không có chữ hiển thị; `role="status"`, `aria-busy="true"`,
  `aria-label="Đang tải dữ liệu"` (contract ở `utils/loadingOverlay.js`, có test).
- Ẩn 150ms đầu (`loadingSkeletonIn`) để tải nhanh không bị chớp skeleton.
- Màu lấy từ token (`--border-subtle`, `--surface-subtle`, `--surface-default`) nên
  dark mode tự đúng. `prefers-reduced-motion`: giữ khung, bỏ vệt sáng.
- Không chặn UI: là nội dung inline, sidebar/header vẫn dùng được.

Sync nền khi đã có số (refresh ngày mới, thử lại) **không** hiện skeleton: số cũ
giữ nguyên, Header chỉ đổi dòng trạng thái.

Các spinner nhỏ gắn với một hành động cụ thể (nút "Lưu xử lý", "Tải lại" trong
COD/AI) giữ nguyên; chúng không phải trạng thái chờ dữ liệu của tab.

## Phân biệt loading / empty / error

- Khởi tạo `loading` trước render đầu, không đợi `useEffect` mới bật. Khi đổi ngày, dataset hay phạm vi request, kết quả của phạm vi cũ không được coi là empty của phạm vi mới.
- `App.jsx` giữ `pendingDatasets` cho Pick, Deli, FD, Ca 1 và Leadtime. Callback core chỉ kết thúc loading của nguồn core thực sự đã trả về; các nguồn phụ tiếp tục chờ đến khi sync kết thúc (kể cả fallback/lỗi).
- Module khai báo `requiredDatasets` trong registry. `isReportDataLoading` kiểm tra cờ pending và **dòng nguồn chưa lọc**. `ModuleSurfaceOutlet` hiện skeleton trước cả overlay/empty của module; Tổng quan tự xử lý qua `dataLoading` để thời tiết vẫn tải độc lập. Nguồn chưa về trong báo cáo đã có một phần số dùng `loadingDatasets` để skeleton đúng vùng.
- Bản cache hoặc dữ liệu cũ đã có vẫn hiển thị khi sync nền. Dữ liệu bị bộ lọc loại hết được báo empty, không biến thành loading vô hạn.
- Request hoàn tất rỗng mới hiện empty. Request lỗi dừng loading, báo lỗi/cho thử lại; không coi lỗi là bằng chứng nguồn rỗng.

## Kiểm tra hồi quy

Chạy `npm run test:loading` và `npm run build`. Bộ kiểm tra render đầu của Tổng quan, bảng chi tiết, module dùng nguồn phụ và các danh sách quản trị phải có skeleton, không có empty giả. Kiểm tra thêm nguồn core về trước Ca 1/Leadtime, partial FD, cache/refresh, lọc rỗng, lỗi và retry. Visual QA chỉ dùng tab riêng trong Codex `iab`; không chạy script mở Chrome/Edge.

## Phạm vi đã đồng bộ

KPI theo ngày/tuần, MTD, dự báo thời tiết, danh sách nhạc BXH, COD/SMS và chi tiết batch, danh mục model, cấu hình AI, hạn mức, nhật ký câu hỏi, lịch chấm/mốc SMS, phân quyền/email và thống kê truy cập đều dùng `LoadingScreen`. Không tự dựng chữ chờ, spinner hay skeleton khác cho vùng dữ liệu. Các bảng đặt component trong `td`; giá trị trong `span`/nút dùng `inline` để giữ HTML hợp lệ.
