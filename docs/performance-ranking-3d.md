# BXH Performance dạng 3D

Tài liệu kỹ thuật cho tính năng 3D của tab "BXH Performance". Kế hoạch tổng thể
nằm ở [performance-ranking-3d-plan.md](performance-ranking-3d-plan.md). File này
được cập nhật theo từng sprint.

## Trạng thái

| Sprint | Nội dung | Trạng thái |
|---|---|---|
| 0 | Khung, thư viện, công tắc 2D/3D, lazy chunk | Xong (tài liệu này) |
| 1 | Cảnh 3D tĩnh: đường, làn, xe, camera toàn cảnh | Xong |
| 2 | Tương tác: chọn xe, nhãn, camera bám xe, làn theo Vùng, bàn phím | Xong |
| 3–5 | Replay, hiệu năng, hoàn thiện | Chưa làm |

## Kiến trúc Sprint 0

| Thành phần | Vai trò |
|---|---|
| `PerformanceRoadRanking.jsx` | Giữ dữ liệu, KPI, bảng, panel chi tiết. Chọn cảnh theo `sceneMode` |
| `RoadScene2D.jsx` | Cảnh SVG/CSS cũ, tách nguyên trạng. Props: `sceneTrucks`, `selectedHubId`, `onSelectHub`. Tự giữ ref và hiệu ứng cuộn tới xe đang chọn |
| `RoadScene3D.jsx` | Cảnh 3D (react-three-fiber). Nạp bằng `React.lazy`, nằm trong chunk riêng. Nhận `sceneTrucks`, dựng canvas, ánh sáng, camera, nhãn checkpoint |
| `roadScene3dParts.jsx` | Các khối con của cảnh: `Road`, `Checkpoint`, `Trucks` (nhóm mesh hoặc `InstancedMesh`, có raycast), `SelectionRing`, `LabelProjector` |
| `TruckTag.jsx` | Nhãn xe dùng chung cho 2D và 3D (`.prr-truck-tag*`) |
| `utils/rankingSceneLayout.js` | Hàm thuần `computeSceneLayout`, `getRoadLength`, `assignRegionLanes`, `getRegionRoadLength`. Có test `rankingSceneLayout.test.mjs` |
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

## Cách thể hiện dữ liệu

Cảnh 3D chỉ là lớp hiển thị. Nó nhận đúng `sceneTrucks` mà cảnh 2D đang dùng
(đã cắt theo Top 10 / Top 20 / Tất cả, có thêm Hub đang chọn nếu nằm ngoài lát
cắt, sắp theo hạng). Đổi KPI hoặc bộ lọc thì `sceneTrucks` đổi và cảnh cập nhật.
Không có logic xếp hạng nào nằm trong 3D.

### Vị trí xe (`computeSceneLayout`)

Cùng quy tắc với cảnh 2D:

- Xe ở vị trí `idx` (0 là hạng cao nhất) có `progress = 1 - idx/(n-1)`; `n = 1`
  thì `0.5`.
- `progress` ánh xạ vào dải `[5%, 88%]` chiều dài đường. Hạng 1 ở xa nhất, về phía
  Mốc chuẩn SLA.
- Làn xen kẽ `[0, 2, 1, 3]` để xe liền kề không chồng nhau. Có thêm chế độ
  "Làn theo Vùng" (xem mục Tương tác).
- Trục `x` chạy dọc đường, trục `z` ngang làn. Đường căn giữa gốc toạ độ.

Chiều dài đường: `clamp(n × 1.6, 36, 320)` đơn vị. Vì làn xen kẽ nên hai xe cùng
làn cách nhau ít nhất 4 slot (≥ 5 đơn vị, xe dài ~3); test kiểm tra với 200 xe.

**Khoảng cách giữa các xe chỉ để dễ nhìn, không tỉ lệ với KPI.** Cảnh có dòng chú
thích "Vị trí thể hiện thứ hạng, không tỉ lệ với KPI".

### Xe tải và màu

Xe dựng bằng khối hình học (không dùng file `.glb`): khung, thùng, sọc cam GHN
`#f15a22`, cabin, kính, đèn, 3 trục bánh. Trạng thái đạt mục tiêu thể hiện bằng
dải đèn trên nóc cabin, màu lấy từ token `--status-success-fg` (đạt) và
`--status-danger-fg` (chưa đạt), cùng token với chấm chú giải. Màu được đọc lại khi
`<body>` đổi class (theme sáng/tối). Nền cảnh luôn tối `#0f172a`, giống khối 2D.

- ≤ 30 xe: mỗi xe là một `group` mesh.
- Trên 30 xe: mỗi bộ phận là một `InstancedMesh` (màu từng xe qua `instanceColor`).
  Vì `InstancedMesh` không đổi số lượng tại chỗ nên `key` có kèm số xe.
- Vạch kẻ đứt gộp vào một `InstancedMesh`.

### Camera, ánh sáng, vòng lặp render

- Góc nhìn nghiêng 35°, tự fit theo chiều dài đường và tỉ lệ khung. `OrbitControls`
  giới hạn: không xuống dưới mặt đường (`maxPolarAngle`), zoom từ 6 đến 1,35 lần
  khoảng cách fit, điểm nhìn bị kẹp trong đường.
- 1 `hemisphereLight` + 1 `directionalLight`. Bóng đổ (PCF) chỉ bật khi ≤ 60 xe.
- `frameloop="demand"`: đứng yên không tốn CPU/GPU, chỉ vẽ khi dữ liệu hoặc camera
  đổi.
- Hai nhãn "Điểm tiếp nhận & điều phối" và "Mốc chuẩn SLA" là DOM phủ lên canvas,
  toạ độ tính bằng `LabelProjector` (chiếu điểm 3D sang màn hình trong `useFrame`).
  Không dùng drei `<Html>`: nó tạo một React root cho mỗi nhãn và báo lỗi
  "synchronously unmount a root" trên React 19. Nhãn Hub ở Sprint 2 cũng đi qua
  đường này.
- Trạng thái rỗng dùng lại `.prr-scene-empty` của component cha.

### Ảnh chụp

`docs/evidence/ranking-3d-sprint1/`: Top 10 / Top 20 / Tất cả (60 Hub) ở theme sáng
và tối. Chụp bằng Playwright + Chrome (WebGL phần mềm) trên dữ liệu mẫu tạm 120
dòng; chỉ 60 Hub đủ điều kiện xếp hạng trong bộ mẫu đó. Chưa thử đủ 200 xe thật.

Đã kiểm tra: console sạch trừ cảnh báo `THREE.Clock deprecated` phát ra từ nội bộ
`@react-three/fiber` (không từ code của dự án).

### Đo bundle sau Sprint 1

`RoadScene3D-*.js`: 936,57 kB (249,61 kB gzip), tăng ~24 kB so với Sprint 0 do
thêm cảnh, `OrbitControls`. `PerformanceRoadRanking-*.js` giữ ~24,75 kB. Chunk
`index-*.js` đổi theo các commit khác trên `main`, không do Sprint này.

## Tương tác

Cảnh 3D đồng bộ hai chiều với bảng và panel chi tiết thông qua `selectedHubId` ở
component cha. Component cha vẫn giữ nguyên các hành vi cũ: bấm lại để bỏ chọn,
Esc bỏ chọn, đổi KPI thì bỏ chọn, nút "Mở chi tiết Hub" gọi `onJumpToReport1`.

### Chọn xe và hover

- Raycast của R3F. Xe ≤ 30 là `group`, bấm vào bất kỳ bộ phận nào đều chọn xe đó.
  Xe > 30 là `InstancedMesh`: dùng `instanceId` của lần va chạm để tra ngược về
  `id` Hub (mỗi bộ phận có handler riêng, `onPointerMove` cập nhật khi đi từ xe
  này sang xe khác trong cùng một mesh).
- Chỉ tính là bấm khi con trỏ gần như không di chuyển (`event.delta ≤ 4px`), nên
  kéo để xoay camera không chọn nhầm xe.
- Hover: con trỏ `pointer`, xe nhô lên 0,25 đơn vị, nhãn của xe đó hiện ngay (kể cả
  xe ngoài Top 10) và nằm trên cùng. Đây cũng là tooltip: tên, hạng, KPI D-1.
- Xe đang chọn: nhô lên 0,12, có vòng sáng cyan `#38bdf8` dưới xe (cùng màu
  spotlight 2D), nhãn viền cyan.

### Nhãn xe

Nhãn là DOM phủ lên canvas, dùng chung `TruckTag` với cảnh 2D: `#hạng`, tên Hub,
KPI D-1 (1 chữ số thập phân), `deltaRank` (`+n`/`-n`, "Mới" khi
`hasCommonBaseline === false`), dấu `!` khi `isSmallSample`. Nhãn có nhãn cho Top
10, xe đang chọn và xe đang hover. `LabelProjector` quyết định mỗi khung hình:

1. Ẩn nhãn nằm sau camera.
2. Ẩn nhãn của xe ở xa camera (Top 10 thường, không áp dụng cho xe chọn/hover):
   xa hơn `max(30, khoảng cách camera-tới-điểm-nhìn × 2,5)`. Ở toàn cảnh mọi xe đều
   trong tầm; khi zoom sát thì chỉ các xe gần mới có nhãn.
3. Xếp theo độ ưu tiên (hover > đang chọn > Top 10 theo hạng > cổng checkpoint >
   nhãn làn) và ẩn nhãn nào chồng lên nhãn đã xếp. Hệ quả: ở toàn cảnh nhiều xe,
   một số nhãn Top 10 sẽ bị ẩn cho tới khi zoom vào hoặc hover; bảng bên dưới vẫn
   là nguồn số liệu đầy đủ.
4. Nhãn luôn nằm trọn trong khung canvas.

### Camera

- "Toàn cảnh" (mặc định): khung nhìn nghiêng 35° ôm cả đường.
- "Bám xe": chọn xe (từ 3D, bảng, bàn phím) thì camera bay mượt tới xe đó
  (làm mượt theo hàm mũ, khoảng 0,5–1 giây). Bỏ chọn thì tự quay về toàn cảnh. Nút
  "Toàn cảnh" quay về mà vẫn giữ lựa chọn; nút "Bám xe" (chỉ bật khi có xe được
  chọn) bay lại.
- Người dùng bắt đầu kéo thì chuyến bay bị huỷ. Vẫn vẽ liên tục trong lúc bay
  (`invalidate()` mỗi khung), xong thì về `frameloop="demand"`.
- `prefers-reduced-motion: reduce`: camera nhảy thẳng tới vị trí mới, không bay.

### Làn theo Vùng

Nút "Làn xen kẽ / Làn theo Vùng" ở góc dưới phải của cảnh (mặc định xen kẽ).

- Mỗi Vùng một làn, sắp theo số xe giảm dần rồi theo tên. Tối đa **6 làn**: nếu
  có hơn 6 Vùng thì 5 Vùng đầu giữ làn riêng, các Vùng còn lại (và xe thiếu
  `region`) gộp vào làn "Khác". Đúng 6 Vùng thì không có làn "Khác".
- Tên Vùng hiện ở đầu mỗi làn. Số làn đổi thì mặt đường rộng ra/hẹp lại.
- Vị trí dọc đường vẫn theo hạng như cũ. Vì xe cùng Vùng có thể liền hạng nhau
  (cùng làn), đường được kéo dài để hai xe cùng làn cách ít nhất 3,4 đơn vị
  (`getRegionRoadLength`), tối đa 640. Quá giới hạn đó (rất nhiều xe dồn một
  Vùng) thì xe có thể chồng nhau về hình ảnh.
- Lựa chọn này chỉ lưu trong phiên xem, không ghi `localStorage`.

### Bàn phím và tiếp cận

- Khung cảnh (`role="group"`, `tabIndex=0`) nhận phím khi đang focus:
  `←`/`→` chuyển Hub kế bên theo hạng (`→` lên một hạng, vì hạng cao nằm bên
  phải), `Enter` mở chi tiết (cuộn tới và focus panel chi tiết; nếu chưa chọn gì
  thì chọn Hub hạng 1). Esc vẫn là bỏ chọn (phím ở cấp trang).
- `aria-label` mô tả cảnh, số Hub, 3 Hub dẫn đầu, phím tắt và trỏ người dùng tới
  bảng đối soát. Có vùng `aria-live` đọc "Đã chọn Hub …, hạng …, KPI …".
- Nhãn phủ là `aria-hidden` (số liệu có ở bảng).

### Kiểm tra

Chạy bằng Playwright + Chrome (WebGL phần mềm) trên dữ liệu mẫu tạm, 16 bước, tất
cả đạt, console sạch (trừ `THREE.Clock deprecated` của R3F):

hover (con trỏ + nhãn) · bấm chọn · camera sang "Bám xe" · nhãn đang chọn · bấm lại
bỏ chọn · về toàn cảnh khi bỏ chọn · chọn từ bảng thì xe sáng lên trong 3D · nút
"Toàn cảnh" giữ lựa chọn · `→`/`←` · `Enter` focus panel · Esc · đổi KPI khi đang
chọn thì bỏ chọn · làn theo Vùng · chọn xe trong chế độ `InstancedMesh` (34 xe) ·
reduced-motion. Cảnh 2D kiểm tra lại: 20 xe, 20 nhãn, chọn xe vẫn chạy.

Ảnh: `docs/evidence/ranking-3d-sprint2/` (`select-follow`, `overview-with-selection`,
`region-lanes`, `all-select`).

Chưa kiểm tra: chọn từ ô tìm kiếm của bảng (ô này chỉ lọc dòng bảng, chọn vẫn đi
qua bấm dòng nên dùng cùng luồng); cảm ứng trên điện thoại (Sprint 4).
