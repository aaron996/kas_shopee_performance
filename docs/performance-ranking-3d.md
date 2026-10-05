# BXH Performance dạng 3D

Tài liệu kỹ thuật cho tính năng 3D của tab "BXH Performance". Kế hoạch tổng thể
nằm ở [performance-ranking-3d-plan.md](performance-ranking-3d-plan.md). File này
được cập nhật theo từng sprint.

## Trạng thái

| Sprint | Nội dung | Trạng thái |
|---|---|---|
| 0 | Khung, thư viện, công tắc 2D/3D, lazy chunk | Xong (tài liệu này) |
| 1–5 | Cảnh 3D thật, tương tác, Replay, hiệu năng, hoàn thiện | Chưa làm |

## Kiến trúc Sprint 0

| Thành phần | Vai trò |
|---|---|
| `PerformanceRoadRanking.jsx` | Giữ dữ liệu, KPI, bảng, panel chi tiết. Chọn cảnh theo `sceneMode` |
| `RoadScene2D.jsx` | Cảnh SVG/CSS cũ, tách nguyên trạng. Props: `sceneTrucks`, `selectedHubId`, `onSelectHub`. Tự giữ ref và hiệu ứng cuộn tới xe đang chọn |
| `RoadScene3D.jsx` | Cảnh 3D (react-three-fiber). Nạp bằng `React.lazy`, nằm trong chunk riêng. Hiện mới có nền + mặt đường phẳng |
| `utils/sceneCapability.js` | Hàm thuần: `detectWebGL2(createCanvas)`, `pickDefaultSceneMode(...)`. Có test `sceneCapability.test.mjs` |

Không sửa `utils/performanceRanking.js`, không thêm file trong `api/`.

### Chọn chế độ 2D / 3D

`pickDefaultSceneMode({ webgl2, cores, reducedMotion, saved })`:

1. Không có WebGL2 → luôn `2d` (kể cả khi đã lưu `3d`).
2. Có WebGL2 và đã lưu lựa chọn hợp lệ (`2d`/`3d`) → dùng lựa chọn đã lưu.
3. Còn lại: `3d` nếu `navigator.hardwareConcurrency > 4`, ngược lại `2d`
   (không đọc được số nhân cũng là `2d`).
4. `prefers-reduced-motion` không đổi chế độ; nó chỉ tắt tự chạy/camera bay ở
   các sprint sau.

Lựa chọn của người dùng lưu ở `localStorage` key `ghn.ranking.sceneMode`
(đọc/ghi đều bọc `try/catch`; bị chặn storage thì chỉ là không nhớ). Nút "3D"
bị `disabled` và có tooltip giải thích khi không có WebGL2.

Fallback khi chờ chunk 3D: `LoadingScreen variant="block"` trong `Suspense`
(skeleton chung của dự án, xem [loading-states.md](loading-states.md)).

Trạng thái chọn Hub (`selectedHubId`) nằm ở component cha nên giữ nguyên khi
chuyển qua lại 2D/3D.

## Đo bundle

Đo bằng `npm run build` (Vite 8). Đơn vị kB, trong ngoặc là gzip.

| Chunk | Trước (main) | Sau Sprint 0 | Chênh |
|---|---|---|---|
| `index-*.js` (app chính) | 704,92 (220,07) | 706,34 (220,50) | +1,42 (+0,43) |
| `PerformanceRoadRanking-*.js` | 22,90 (6,36) | 24,74 (7,12) | +1,84 (+0,76) |
| `RoadScene3D-*.js` (mới: three + R3F + drei dùng tới + cảnh) | – | 912,63 (242,33) | +912,63 (+242,33) |
| `index-*.css` | 193,54 (34,07) | 193,82 (34,08) | +0,28 |

Nhận xét:

- Chunk 3D rất nặng (~0,9 MB, ~242 kB gzip) nhưng chỉ tải khi tab BXH ở chế độ 3D.
  Với cảnh trống hiện tại, phần lớn là lõi `three` + R3F; con số sẽ tăng khi có
  thêm drei (OrbitControls, Html, PerformanceMonitor) ở các sprint sau.
- `index.html` không có `modulepreload` cho `RoadScene3D`.
- Phần tăng ở `index-*.js` (+1,4 kB) và `PerformanceRoadRanking` (+1,8 kB) do
  Rolldown chia lại chunk dùng chung và do code công tắc/phát hiện WebGL; chưa
  tìm hiểu sâu vì nhỏ.
- Cảnh báo "chunk > 500 kB" của Vite đã có từ trước (`index-*.js`); chunk 3D
  cũng bị cảnh báo. Chưa chỉnh `chunkSizeWarningLimit`.

### Xác nhận chế độ 2D không tải three

Kiểm tra trên dev server (`localStorage['ghn.ranking.sceneMode'] = '2d'`, tải lại
trang, mở tab BXH, chọn một xe):

- `performance.getEntriesByType('resource')` không có `RoadScene3D`, `three`,
  `@react-three/*`.
- DOM không có `<canvas>`; có 16 `.prr-truck-btn`.
- Bấm "3D" thì mới xuất hiện request `RoadScene3D.jsx` và `<canvas>`.

## Kiểm tra trình duyệt

Dùng [local-preview.md](local-preview.md) kèm dữ liệu mẫu tạm (30 Hub × 2 ngày
D-1/D-8 gắn thẳng vào state, đã gỡ trước khi commit; tab này cần Dev Admin nên
cũng bật tạm `isDevAdmin`).

- 2D: giao diện và chọn xe như trước; theme sáng/tối bình thường.
- 3D: canvas dựng đúng kích thước 290 px, đọc pixel thấy nền `#0f172a` và mặt
  đường `#475569` đã được chiếu sáng; theme sáng/tối cùng một khung tối giống
  khối 2D.
- Chuyển 2D ↔ 3D lưu lựa chọn, giữ Hub đang chọn và panel chi tiết.
- Không có lỗi console liên quan.

Giới hạn khi kiểm tra: ảnh chụp màn hình của pane trình duyệt chập chờn với
canvas WebGL nên bằng chứng cảnh 3D ở Sprint này là đọc pixel + DOM, chưa có
ảnh. Ảnh chụp sẽ làm ở Sprint 1.
