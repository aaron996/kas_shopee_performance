# Trạng thái chờ dữ liệu

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
| `variant="page"` | Vùng chính của app khi chưa có số lần đầu (`App.jsx`); fallback `Suspense` khi mở tab lazy (`ModuleSurfaceOutlet.jsx`) | 4 ô KPI + biểu đồ + bảng 7 dòng |
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

## Phạm vi đã đồng bộ

KPI theo ngày/tuần, MTD, dự báo thời tiết, danh sách nhạc BXH, COD/SMS và chi tiết batch, danh mục model, cấu hình AI, hạn mức, nhật ký câu hỏi, lịch chấm/mốc SMS, phân quyền/email và thống kê truy cập đều dùng `LoadingScreen`. Không tự dựng chữ chờ, spinner hay skeleton khác cho vùng dữ liệu. Các bảng đặt component trong `td`; giá trị trong `span`/nút dùng `inline` để giữ HTML hợp lệ.
