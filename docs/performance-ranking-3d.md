# BXH Performance dạng 3D

## Chuyển động xe (2026-10-06)

- Toolbar có thanh tốc độ 0,25×–4×, bước 0,25×, mặc định 2× so với tốc độ gốc;
  nút reset về 2×. Giữ lựa chọn khi đổi 2D/3D, đổi KPI hoặc tạm dừng; tải lại
  trang về mặc định 2×. Tốc độ áp dụng cả chạy nền và replay (3 giây ở 1×,
  1,5 giây ở 2×), không thay đổi thứ hạng/KPI.
- 3D nhân delta của clock sau khi giới hạn wall time; đổi tốc độ không reset
  clock hay replay. 2D dùng WAAPI `updatePlaybackRate` trên các CSS animation
  của cảnh để giữ pha hiện tại; không đổi `animation-duration` giữa chừng.
- Xe chạy nền trong hệ quy chiếu của đoàn: vị trí thứ hạng không đổi khi dữ liệu
  không đổi. Vạch đường và texture nhựa đường trôi ngược; ba vành bánh có dấu quay.
  Thân xe nhún 0,012 đơn vị, lệch pha; nhãn giữ nguyên điểm neo để dễ đọc.
- Cây và biển báo dùng cùng khoảng đường đã đi với bánh/vạch đường. Bốn mesh
  instanced cập nhật vị trí, không thêm timer hay setState từng frame. Props mờ
  dần trong 6 đơn vị ở mỗi đầu vùng đệm 12 đơn vị ngoài đường, rồi xuất hiện lại
  từ phía trước. Tạm dừng/ẩn/giảm chuyển động đóng băng cả cảnh ven đường.
- Bỏ hai cổng xanh/vàng và nhãn checkpoint ở 3D; bỏ mốc SLA giả định ở 2D.
  Vị trí dọc đường chỉ thể hiện thứ hạng. Đạt/chưa đạt mục tiêu vẫn thể hiện qua
  màu trạng thái, nhãn KPI và bảng. Các phần ghi lại sprint bên dưới mô tả
  lịch sử triển khai trước khi bỏ cổng.
- Replay vẫn kết thúc đúng layout D-1 trong 3 giây ở 1×. Tốc độ đường mỗi frame cộng
  phần tụt hạng lớn nhất vào tốc độ chạy nền, vì vậy bánh xe của Hub tụt hạng vẫn
  quay về phía trước. Xe chuyển làn theo đường cong, góc lái giới hạn ±0,18 rad.
  Đổi bộ lọc/làn giữa replay nối từ vị trí đang nhìn thấy.
  Camera bám theo vị trí xe đang chuyển hạng, giữ góc orbit và mức zoom của người xem.
- Nút Tạm dừng/Tiếp tục nằm ở toolbar chung, giữ lựa chọn khi đổi 2D/3D. Tạm dừng
  đóng băng cả replay, bánh và mặt đường. Tab bị ẩn hoặc scene ngoài viewport cũng
  đóng băng thời gian; quay lại tiếp tục từ vị trí cũ. Giảm chuyển động tắt chạy
  nền và replay, giữ chọn xe/camera và bảng số liệu.
- `useScenePlayback.js` giữ trạng thái đọc/visibility; `sceneDriving.js` giữ clock
  và phép tính chuyển động thuần. `DriveClock` kích hoạt canvas on-demand ở 30fps
  khi chạy nền, 60fps khi replay; tạm dừng/ẩn không còn timer. Hơn 60 xe bỏ nhún
  thân và chỉ cập nhật ba mesh vành trong chạy nền; shadow map chỉ cập nhật khi
  đổi layout/chọn xe hoặc replay, không cập nhật theo nhún nền.
- 2D dùng CSS transform cho vạch đường, bánh và cabin, cùng trạng thái tạm dừng.
  2D tiếp tục là đường lui nhẹ, không nhập Three.js.

Kiểm tra logic: `node --test src/utils/sceneDriving.test.mjs
src/utils/rankingSceneLayout.test.mjs src/utils/performanceRanking.test.mjs
src/utils/sceneCapability.test.mjs src/utils/sceneThemes.test.mjs`. Kiểm tra trực quan dùng tab riêng trong Codex
IAB với fixture cục bộ; không thay đổi quyền đăng nhập hay đọc dữ liệu live.

QA cục bộ đã kiểm tra 2D/3D, pause giữa replay, đổi làn khi replay đang chạy,
camera bám xe, giảm chuyển động, viewport mobile 390px và cảnh 1.200 Hub mẫu.
QA thanh tốc độ trong IAB xác nhận clock 3D mặc định chạy 2× theo thời gian thực;
2D nhận 4× rồi 0,25×, đổi tốc độ lúc pause không đổi currentTime và vẫn paused.
Reset về 2×, tiếp tục và đổi 2D/3D giữ đúng tốc độ; không có lỗi console.
Sau sửa cảnh ven đường, đo ma trận instance trong IAB xác nhận cây/biển báo/vạch
đường cùng dịch chuyển trong chạy nền và replay; trunk/canopy, pole/plate giữ
cùng vị trí và alpha. Tạm dừng hoặc cuộn cảnh khỏi viewport đóng băng cả các
mesh này. Cảnh 1.200 xe mẫu chạy nền có 27 draw call và không có lỗi console;
con số này không thay thế kết quả FPS trên thiết bị thật.
Cuộn cảnh hoàn toàn khỏi viewport giữ nguyên clock và số frame render; quay lại
tiếp tục. Probe QA đã được xóa sau kiểm tra; preview dữ liệu mẫu được giữ trong
`extracted/ranking-preview/` (Git ignore) để người dùng xem. Chưa xác nhận trên dữ liệu thật
sau đăng nhập hoặc đo FPS trên thiết bị sử dụng thực tế.

Tài liệu kỹ thuật cho tính năng 3D của tab "BXH Performance". Kế hoạch tổng thể
nằm ở [performance-ranking-3d-plan.md](performance-ranking-3d-plan.md). File này
được cập nhật theo từng sprint.

## Trạng thái

| Sprint | Nội dung | Trạng thái |
|---|---|---|
| 0 | Khung, thư viện, công tắc 2D/3D, lazy chunk | Xong (tài liệu này) |
| 1 | Cảnh 3D tĩnh: đường, làn, xe, camera toàn cảnh | Xong |
| 2 | Tương tác: chọn xe, nhãn, camera bám xe, làn theo Vùng, bàn phím | Xong |
| 3 | Replay D-8 → D-1 và chuyển cảnh khi đổi KPI/bộ lọc | Xong |
| 4 | Hiệu năng, mobile, đường lui, tiếp cận | Xong |
| 5 | Hoàn thiện hình ảnh và tài liệu | Xong |

## Kiến trúc Sprint 0

| Thành phần | Vai trò |
|---|---|
| `PerformanceRoadRanking.jsx` | Giữ dữ liệu, KPI, bảng, panel chi tiết. Chọn cảnh theo `sceneMode` |
| `RoadScene2D.jsx` | Cảnh SVG/CSS cũ, tách nguyên trạng. Props: `sceneTrucks`, `selectedHubId`, `onSelectHub`. Tự giữ ref và hiệu ứng cuộn tới xe đang chọn |
| `RoadScene3D.jsx` | Cảnh 3D (react-three-fiber). Nạp bằng `React.lazy`, nằm trong chunk riêng. Nhận `sceneTrucks`, dựng canvas, ánh sáng, camera và nhãn xe |
| `roadScene3dParts.jsx` | Các khối con của cảnh: `DriveClock`, `Road`, `Roadside`, `TruckFleet` (`InstancedMesh`, lớp chọn xe, vòng lặp animation), `SelectionRing`, `LabelProjector` (vẽ nhãn lên canvas 2D) |
| `labelOverlay.js` | Đo và vẽ nhãn xe, nhãn checkpoint, nhãn làn, chip Replay lên canvas 2D phủ trên cảnh |
| `utils/sceneLabelStyle.js` | Bảng màu nhãn + hàm tính độ tương phản WCAG (có test `sceneLabelStyle.test.mjs`) |
| `SceneErrorBoundary.jsx` | Bắt lỗi tải chunk 3D / lỗi render để rơi về 2D |
| `utils/sceneThemes.js` | Màu cảnh theo theme sáng/tối (trời, nền, nhựa đường, cây, biển báo, đèn) và vị trí cây/biển báo (`computeRoadside`). Có test `sceneThemes.test.mjs` |
| `TruckTag.jsx` | Nhãn xe dùng chung cho 2D và 3D (`.prr-truck-tag*`) |
| `utils/rankingSceneLayout.js` | Hàm thuần `computeSceneLayout`, `getRoadLength`, `assignRegionLanes`, `getRegionRoadLength`, `computeReplayFrames`, `computeTransitionFrames`, easing. Có test `rankingSceneLayout.test.mjs` |
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

- Từ Sprint 3, mọi số lượng xe đều dùng `InstancedMesh` (mỗi bộ phận của xe một mesh,
  màu từng xe qua `instanceColor`, độ mờ từng xe qua thuộc tính `instanceAlpha`). Sprint 1–2
  chỉ dùng `InstancedMesh` khi > 30 xe và dùng `group` cho số xe nhỏ; bỏ nhánh `group` để
  animation và độ mờ chỉ có một đường chạy. Số draw call cố định (~12) bất kể số xe.
  `InstancedMesh` không đổi số lượng tại chỗ nên `TruckFleet` được remount khi số xe đang
  vẽ đổi.
- Vạch kẻ đứt gộp vào một `InstancedMesh`.

### Camera, ánh sáng, vòng lặp render

- Góc nhìn nghiêng 35°, tự fit theo chiều dài đường và tỉ lệ khung. `OrbitControls`
  giới hạn: không xuống dưới mặt đường (`maxPolarAngle`), zoom từ 6 đến 1,35 lần
  khoảng cách fit, điểm nhìn bị kẹp trong đường.
- 1 `hemisphereLight` + 1 `directionalLight`. Bóng đổ (PCF) chỉ bật khi ≤ 60 xe.
- `frameloop="demand"`: đứng yên không tốn CPU/GPU, chỉ vẽ khi dữ liệu hoặc camera
  đổi.
- Nhãn (hai checkpoint, nhãn xe, nhãn làn, chip Replay) được vẽ lên một **canvas 2D** đặt
  chồng trên canvas WebGL; toạ độ tính bằng `LabelProjector` (chiếu điểm 3D sang màn hình
  trong `useFrame`). Không dùng drei `<Html>`: nó tạo một React root cho mỗi nhãn và báo lỗi
  "synchronously unmount a root" trên React 19. Từ Sprint 4 cũng không dùng DOM di chuyển mỗi
  khung hình, xem mục "Hiệu năng" bên dưới.
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

- Raycast của R3F trên `InstancedMesh`: dùng `instanceId` của lần va chạm để tra ngược
  về `id` Hub (mỗi bộ phận có handler riêng, `onPointerMove` cập nhật khi đi từ xe này
  sang xe khác trong cùng một mesh).
- Chỉ tính là bấm khi con trỏ gần như không di chuyển (`event.delta ≤ 4px`), nên
  kéo để xoay camera không chọn nhầm xe.
- Hover: con trỏ `pointer`, xe nhô lên 0,25 đơn vị, nhãn của xe đó hiện ngay (kể cả
  xe ngoài Top 10) và nằm trên cùng. Đây cũng là tooltip: tên, hạng, KPI D-1.
- Xe đang chọn: nhô lên 0,12, có vòng sáng cyan `#38bdf8` dưới xe (cùng màu
  spotlight 2D), nhãn viền cyan.

### Nhãn xe

Nhãn mang nội dung giống nhãn 2D (`TruckTag`): `#hạng`, tên Hub, KPI D-1 (1 chữ số thập phân),
`deltaRank` (`+n`/`-n`, "Mới" khi `hasCommonBaseline === false`), dấu `!` khi `isSmallSample`,
viền trên xanh/đỏ theo đạt mục tiêu. Từ Sprint 4 chúng được vẽ bằng canvas 2D (`labelOverlay.js`)
chứ không còn là DOM `.prr-truck-tag*`; cảnh 2D vẫn dùng `TruckTag`. Nhãn hiện cho Top 10, xe đang
chọn và xe đang hover. `LabelProjector` quyết định mỗi khung hình:

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

Chạy bằng Playwright + Chrome (WebGL phần mềm) trên dữ liệu mẫu tạm, tất
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

## Replay D-8 → D-1

Nút "Replay D-8 → D-1" ở góc dưới phải của cảnh 3D. Nút bị tắt (kèm tooltip) khi chưa có
ngày D-8 hoặc không Hub nào có baseline chung.

### Hạng nào được dùng

Replay dựa trên **hạng trong nhóm đối soát chung** (`cohortRankD8`, `cohortRankD1`, tức
chỉ những Hub có dữ liệu cả D-1 lẫn D-8), **không phải `rank` toàn bộ**. Đây cũng là hạng
mà cột "Δ Hạng" trong bảng và nhãn `+n/-n` dùng (`deltaRank = cohortRankD8 - cohortRankD1`),
nên Replay khớp với bảng:

- `deltaRank > 0`: Hub lên hạng, xe chạy **tiến lên** và có mũi tên xanh.
- `deltaRank < 0`: Hub tụt hạng, xe **lùi lại** và có mũi tên đỏ.
- `deltaRank = 0`: xe đứng yên, không mũi tên.
- Hub không có baseline (`hasCommonBaseline !== true`, nhãn "Mới"): xe xuất phát ở cổng
  "Điểm tiếp nhận & điều phối", trong suốt, và hiện dần trong lúc chạy tới vị trí của nó.

### Cách tính vị trí (`computeReplayFrames`)

- Vị trí kết thúc = vị trí tĩnh của cảnh (đúng `computeSceneLayout`). Kiểm tra bằng ảnh:
  trước và sau Replay giống nhau tới từng điểm ảnh (sai khác làm tròn ≤ 3/765, dưới 50 điểm).
- Vị trí bắt đầu = vị trí tĩnh của "ô" `idx + deltaRank`, kẹp trong `[0, n-1]`. Hai Hub trùng
  ô xuất phát thì Hub sau bị đẩy sang ô trống gần nhất để không chồng nhau.
- Khi cảnh chỉ hiện Top N, `idx` là chỉ số trong lát cắt đang hiện. Một Hub có `deltaRank`
  rất lớn có thể bị kẹp ở cuối đoạn đường đang hiện (không xuất phát từ ngoài khung nhìn).
  Hướng và mũi tên luôn lấy từ dấu của `deltaRank`, nên luôn khớp bảng; chỉ khoảng cách
  chạy là xấp xỉ.
- Chế độ "Làn theo Vùng": mỗi xe giữ làn của Vùng mình, chỉ thay đổi vị trí dọc đường.

### Hiển thị

- Thời lượng 3 giây, easing `easeInOutCubic`.
- Chip ở giữa phía trên (vẽ trên canvas 2D): `D-8 <ngày> ▬▬▬ D-1 <ngày>` với thanh tiến độ. Ngày
  đang "hiện hành" sáng, ngày còn lại mờ (đổi ở nửa thời gian). Vùng `aria-live` đọc "Đang chạy
  Replay D-8 … sang D-1 …".
- 2 giây cuối: mũi tên (nón) xanh/đỏ nhấp nhô trên nóc các xe đã đổi hạng.
- Lần đầu mở 3D trong một lần tải trang: tự chạy Replay một lần (cờ `autoReplayDone` trong
  module nên chuyển 2D ↔ 3D không chạy lại). Không tự chạy khi `prefers-reduced-motion`,
  nhưng bấm nút vẫn chạy bình thường.

### Vòng lặp render

Mỗi khung hình `TruckFleet` ghi lại ma trận của mọi bộ phận, `instanceAlpha` và vị trí hiện
tại của từng xe (`positionsRef`) rồi gọi `invalidate()`. Nhãn xe, vòng chọn và các mũi tên đọc
vị trí từ `positionsRef` nên bám theo xe đang chạy. Khi chuyển động xong thì ngừng
`invalidate()` và cảnh về `frameloop="demand"`.

Độ mờ từng xe: `MeshStandardMaterial`/`MeshBasicMaterial` được vá bằng `onBeforeCompile` để
nhân alpha với thuộc tính instance `instanceAlpha`. Material để `transparent` ngay từ đầu: đổi
`transparent` lúc chạy làm three đổi khoá chương trình (define `OPAQUE`) và biên dịch lại bộ
shader đúng lúc Replay bắt đầu làm mờ xe; alpha = 1 thì cho kết quả như vật liệu đặc.

## Chuyển cảnh khi đổi KPI / bộ lọc

Khi `sceneTrucks` đổi (đổi KPI, bộ lọc, Top 10/20/Tất cả, chọn Hub ngoài lát cắt, đổi kiểu
làn), cảnh tính `computeTransitionFrames` ngay trong lúc render nên khung hình đầu tiên đã
xuất phát từ vị trí cũ (không chớp):

- Hub có ở cả hai trạng thái: trượt từ vị trí cũ sang vị trí mới trong 0,8 giây.
- Hub mới xuất hiện: hiện dần tại chỗ.
- Hub bị loại: vẫn được vẽ ("ghost") và mờ dần tại chỗ, sau đó bị bỏ.
- Vị trí không đổi (ví dụ chỉ đổi Hub đang chọn): không có chuyển động, và một Replay đang
  chạy không bị ngắt.
- `prefers-reduced-motion`: nhảy thẳng sang trạng thái mới.

### Kiểm tra Sprint 3

Playwright + Chrome (WebGL phần mềm), dữ liệu mẫu tạm có cả Hub "Mới": tự chạy Replay lần
đầu · chip biến mất khi xong · ngày D-8/D-1 trên chip · pha chuyển `from → to` · kết thúc
Replay trùng ảnh tĩnh · reduced-motion không tự chạy nhưng nút vẫn chạy · không chip/chuyển
cảnh khi đổi KPI với reduced-motion · cảnh sau chuyển cảnh (đổi KPI, Top 20 → Top 10) trùng ảnh
nhảy thẳng của reduced-motion · console sạch (trừ `THREE.Clock deprecated` của R3F). Bộ kiểm
tra tương tác của Sprint 2 chạy lại, vẫn đạt.

Ảnh: `docs/evidence/ranking-3d-sprint3/` — `replay-0150ms` … `replay-2800ms` (chuỗi khung hình,
mũi tên xuất hiện từ ~1 giây; Hub "Mới" mờ gần cổng tiếp nhận), `transition-mid`,
`transition-limit-mid`, `rest-before`.

Chưa đo: chi phí mỗi khung hình khi Replay với vài trăm xe (ghi 11 ma trận × số xe mỗi khung);
sẽ đo ở Sprint 4.

## Hiệu năng, mobile, đường lui, tiếp cận (Sprint 4)

### Đo hiệu năng

**Quy mô thật.** Truy vấn đếm (chỉ đếm, không đọc số liệu) trên `kas_pick_data`, ngày D-1
`2026-10-04`: **1.167 Hub** có dữ liệu D-1 (1.493 Hub nếu tính mọi ngày), 14 Vùng có tên và một
nhóm không có Vùng. Phân bố theo Vùng lấy từ truy vấn này. Số liệu KPI không đọc từ DB nên **bộ
đo dùng dữ liệu tổng hợp** có đúng 1.167 Hub, đúng phân bố Vùng và Loại Hub `BC`, thêm khoảng 1/9
Hub không có D-8 để có Hub "Mới". Chế độ "Tất cả" vì vậy có **1.167 xe**, không phải "vài trăm"
như plan giả định; Top 20 là 20 xe.

**Cách đo.** Playwright + Chrome 1 cửa sổ 1440×900 (mobile: 375×812, DPR 3, cảm ứng). Chạy trên
bản build production (`vite build` + `vite preview`, có vá tạm đường đăng nhập local và handle đo
`window.__ranking3d` chỉ để đo; không commit). FPS lấy từ bộ đếm `requestAnimationFrame` trong
trang: (a) kéo xoay camera liên tục 3 giây, (b) 3 giây Replay. GPU thật là NVIDIA RTX 3050 Laptop;
"không GPU" = WebGL bằng CPU (SwiftShader), gần với máy văn phòng không card rời nhưng
thường vẫn nhanh hơn máy yếu thật; "CPU ×4" = `Emulation.setCPUThrottlingRate(4)`.
**Đây là máy phát triển, không phải máy ở hub; con số tuyệt đối không thay được phép đo trên máy
thật.** `1% thấp` = fps của 1% khung chậm nhất.

| Cấu hình | Số xe | Xoay camera (TB / 1% thấp) | Replay (TB / 1% thấp, khung dài nhất) |
|---|---|---|---|
| Desktop, GPU thật | 20 | 119 / 79 fps | 112 / 15 fps, 133 ms |
| Desktop, GPU thật | 1.167 | 119 / 60 fps | 91 / 6 fps, 266 ms |
| Desktop, GPU thật, CPU ×4 | 20 | 81 / 16 fps | 23 / 1 fps, 1.200 ms |
| Desktop, GPU thật, CPU ×4 | 1.167 | 78 / 11 fps | 22 / 1 fps, 1.475 ms |
| Desktop, không GPU (SwiftShader) | 20 | 56 / 10 fps | 19 / 4 fps, 236 ms |
| Desktop, không GPU (SwiftShader) | 1.167 | 15 / 3 fps | 5 / 3 fps, 382 ms |
| Mobile 375×812, CPU ×4 | 20 | 80 / 20 fps | 31 / 1 fps, 1.209 ms |
| Mobile 375×812, CPU ×4 | 1.167 | 85 / 28 fps | 17 / 1 fps, 1.092 ms |

Nhận xét:

- Bản đo đầu tiên (trước tối ưu, build dev) với 1.167 xe và GPU thật: xoay 70 fps (1% thấp 10 fps),
  Replay 46 fps (1% thấp 7 fps); mô phỏng CPU ×4: xoay 30 fps, Replay 9 fps; không GPU: xoay 4 fps.
  Sau tối ưu: xoay ổn định ≥ 78 fps ở mọi cấu hình có GPU, kể cả CPU ×4.
- **Khung rất dài (~1 giây ở CPU ×4) trong Replay là một lần vẽ lại cả trang**, xảy ra khi bấm
  nút và khi kết thúc (nút đổi trạng thái, vùng `aria-live` đổi chữ). Trang có bảng ~1.200 dòng nên
  mỗi thay đổi DOM nhìn thấy được tốn ~45 ms thật (×4 = ~180 ms) cho lần vẽ lại, bất kể thay đổi
  nhỏ cỡ nào. Trong lúc chạy, khung hình 7–21 ms thật. Ở GPU thật, CPU ×1 hitch chỉ ~120–270 ms.
- Không GPU với "Tất cả" (1.167 xe, ~320 nghìn tam giác) vẫn chậm (15 fps xoay, 5 fps Replay):
  fill-rate phần mềm. Quy tắc chọn chế độ mặc định của plan (3D khi `hardwareConcurrency > 4`)
  và công tắc 2D/3D là đường lui; với máy không GPU nên dùng Top 10/20.
- Bộ nhớ GPU ước tính (công thức bên dưới): ~5 MB không đổ bóng, ~21 MB có bóng (Top ≤ 60 xe, desktop).
  Bộ nhớ JS sau khi vào BXH: 21 MB (20 xe) / 29 MB (1.167 xe) ở build production.

**Bộ nhớ GPU ước tính.** Bộ đệm instance: mỗi xe ~12 bộ phận × 64 B ma trận + 2 bộ phận × 12 B màu
+ 11 × 4 B độ mờ ≈ 0,84 KB → 1.167 xe ≈ 1 MB; hình học: 24 geometry nhỏ (< 0,1 MB); khung hình: 1094×338×4 B
×(màu + độ sâu) ≈ 3 MB ở DPR 1 (mobile DPR ≤ 1,25: ~1 MB); bản đồ bóng 2048² độ sâu 32 bit = 16 MB
(chỉ khi ≤ 60 xe, không phải mobile, chưa tụt chất lượng). `renderer.info`: 24 geometry, 3 texture,
8–13 chương trình shader, 19–34 draw call (gồm lượt vẽ bóng), 5,7 nghìn / 321 nghìn tam giác (20 / 1.167 xe).

**Thời gian từ lúc mở tab tới lúc thấy xe** (build production, CPU ×1, 1.167 Hub, từ lúc bấm nút
"BXH Performance"): khoảng **3,5 giây** ở 3D so với ~2,0 giây ở 2D. Trong 3D: ~0,8 giây tới khi
thẻ cảnh và bảng có mặt; ~1,1 giây là render trang (xếp hạng + bảng 1.167 dòng, có cả ở 2D);
phần còn lại ~1,5 giây là nạp chunk 3D (957 kB, ~321 ms mạng), tạo ngữ cảnh WebGL, biên dịch shader
và khung hình đầu. Ở CPU ×4 tổng là ~36 giây (2D: ~9–10 giây). Điểm yếu của 3D là lần mở đầu trên
CPU chậm; máy ≤ 4 nhân mặc định 2D nên không gặp, và máy mạnh chỉ mất thêm ~1,5 giây.

### Điều đã tối ưu (và vì sao)

Nút thắt thật không nằm ở three.js. Cắt dần từng thành phần (tắt riêng bóng, nhãn, raycast, rồi
vài tổ hợp) cho thấy: chạy cùng lúc **nhãn DOM di chuyển mỗi khung hình** và **bảng 1.167 dòng**
làm trình duyệt vẽ lại toàn bộ trang (một lần `Paint` của cả tài liệu 1440×4900 px, ~170 ms thật)
cho từng khung hình. Chỉ cần một `<div>` đổi `transform` phía trên canvas cũng đủ gây ra (thử riêng
một div đơn lẻ: 9,7 fps ở CPU ×4); đặt `contain`, `will-change`, bỏ `backdrop-filter`, đổi
`visibility` sang `opacity` đều không đổi kết quả.

| Thay đổi | Lý do | Tác dụng đo được (CPU ×4, Top 20, kéo xoay) |
|---|---|---|
| Vẽ nhãn lên canvas 2D thay vì DOM | Bỏ thay đổi DOM theo khung hình | 3 → 71 fps (CPU ×1: 34 → 118 fps) |
| Chọn xe bằng một lớp "pick" riêng (ray–hộp theo từng xe, không phải `InstancedMesh.raycast`) | `InstancedMesh.raycast` của three thử bounding-sphere và tam giác cho từng thể hiện của 11 mesh (~13.000 phép thử mỗi lần di chuột với 1.167 xe) | Bỏ ~55 ms/3 giây khỏi hồ sơ CPU; chọn vẫn đúng (kiểm thử tương tác) |
| Không cập nhật hover khi đang giữ nút chuột | Kéo xoay quét qua nhiều xe gây render lại React liên tục | 4 → 7 fps (trước khi vẽ nhãn bằng canvas) |
| Đo kích thước nhãn một lần (không đọc `offsetWidth` mỗi khung), chỉ ghi style khi đổi | Tránh ép layout cả tài liệu mỗi khung hình | Giảm, kết hợp các mục trên |
| `shadowMap.autoUpdate = false`, chỉ cập nhật khi xe đổi chỗ | Đèn đứng yên nên bản đồ bóng không cần vẽ lại khi chỉ xoay camera | Bỏ 1 lượt vẽ bóng/khung khi xoay |
| Chip Replay vẽ trên canvas 2D (không còn CSS animation DOM) | CSS animation DOM cũng gây vẽ lại cả trang mỗi khung | Replay 33 → 61 fps (GPU thật, 20 xe, build dev) |
| Bộ giám sát chất lượng tự viết (xem dưới) thay cho `PerformanceMonitor` của drei | `PerformanceMonitor` đo giữa các khung *được vẽ*, nên với `frameloop="demand"` mọi khoảng nghỉ đều bị tính là chậm | Không dùng drei `PerformanceMonitor` |
| Material `transparent` ngay từ đầu | Tránh biên dịch lại shader khi Replay bắt đầu | Không còn bước biên dịch giữa chừng |
| Đường 4 làn dài tối đa 1.400 đơn vị (trước 320) | 1.167 xe chồng lên nhau ở 320; 1.400 đủ để hai xe cùng làn không đè | Có test cho 1.167 xe |

**Bộ giám sát chất lượng thích ứng.** Khi một lần Replay có tốc độ khung *trung vị* dưới 30 fps (bỏ
6 khung đầu; cần ≥ 12 khung) **hai lần liên tiếp**, cảnh tụt xuống bậc thấp: tắt bóng đổ và DPR
0,8. Chỉ tính Replay, vì chuyển cảnh theo sau đổi KPI/bộ lọc bị chính việc xếp hạng lại + bảng
1.167 dòng làm đói khung. Một Replay nhanh đặt lại bộ đếm. Chưa có đường lên lại bậc cao trong một
lần xem. Bậc thấp cũng áp dụng sẵn trên thiết bị cảm ứng / màn hình ≤ 768 px (không bóng, DPR ≤ 1,25).

**Bóng đổ**: bật khi ≤ 60 xe, không phải mobile, bậc cao. **Gộp geometry tĩnh**: chưa làm, vì tổng
draw call chỉ 19–34 (đường, vạch kẻ, cổng, 11 bộ phận xe, mũi tên, vòng chọn) và không phải nút thắt.

### Mobile

- Chiều cao cảnh `clamp(280px, 58dvh, 400px)` trên màn hình ≤ 640 px (400 px / 812 px khi đo).
- Chạm: kéo một ngón theo chiều ngang để xoay, hai ngón chụm/mở để zoom, chạm xe để chọn.
- **Cuộn trang không bị canvas giữ lại.** `OrbitControls` đặt `touch-action: none` trên canvas, và
  react-three-fiber đặt tương tự trên khối bọc canvas; một cảnh cao 400 px sẽ nuốt mọi cú vuốt dọc.
  CSS `.prr-scene3d canvas, .prr-scene3d > div { touch-action: pan-y !important }` (cần `!important` để
  thắng style inline) cho phép vuốt dọc cuộn trang; kéo ngang vẫn xoay và chụm vẫn zoom. Kiểm bằng
  sự kiện chạm CDP: vuốt dọc bắt đầu trên canvas làm trang cuộn (`scrollY` 487 → 759), kéo ngang làm
  camera xoay và trang không cuộn, chụm làm camera đến gần (65,5 → 26,6).
- Nhãn thu gọn khi canvas rộng < 560 px: bỏ chip `+n/Mới/!`, chữ nhỏ hơn, tên tối đa ~64 px; nút điều
  khiển xuống dưới bên trái, chữ nhỏ hơn, bỏ dòng chú thích dài (còn liên kết "Xem dạng bảng").
- Mặc định 2D/3D vẫn theo quy tắc ở mục 2 của plan (`hardwareConcurrency > 4`), nên nhiều điện thoại
  mạnh sẽ mở thẳng 3D. Chưa thử trên điện thoại thật (chỉ mô phỏng).

### Đường lui

| Sự cố | Hành vi | Kiểm |
|---|---|---|
| Không có WebGL2 | Nút 3D bị khoá + tooltip, luôn 2D | Có (chặn `getContext('webgl2')`) |
| Mất ngữ cảnh WebGL (`webglcontextlost`) | Tự chuyển 2D + toast "Trình duyệt đã dừng đồ hoạ 3D…"; **không** ghi đè lựa chọn đã lưu; chọn 3D lại tạo ngữ cảnh mới | Có (`WEBGL_lose_context`) |
| Lỗi tải chunk 3D / lỗi render | `SceneErrorBoundary` chuyển 2D + toast "…Tải lại trang để thử 3D lần nữa" (import động lỗi bị trình duyệt nhớ nên thử lại cần tải lại trang) | Có (chặn request chunk) |
| Tab trình duyệt bị ẩn | Trình duyệt dừng `requestAnimationFrame` nên không vẽ gì; vòng lặp `demand` không tự chạy nên không tốn CPU/GPU. Replay dùng `performance.now()` nên khi quay lại chỉ nhảy tới đích | Dựa trên hành vi trình duyệt, không đo riêng |

Trình nghe `webglcontextlost` được tháo khi cảnh unmount, nên việc nhả ngữ cảnh có chủ đích khi rời
tab không bị tính là sự cố.

### Tiếp cận

- `<canvas>` có `role="img"` và `aria-label` tóm tắt: KPI + mục tiêu, số Hub, số Hub đạt mục tiêu,
  3 Hub dẫn đầu, trỏ tới bảng đối soát. Khung bọc (`role="group"`, `tabIndex=0`) mang nhãn hướng dẫn phím.
- Nút "Xem dạng bảng" (cuối cảnh) cuộn tới và đưa focus vào bảng đối soát.
- Độ tương phản (WCAG 2.x, ngưỡng AA 4,5:1 cho chữ nhỏ, 3:1 cho viền/biểu tượng). Nhãn vẽ trên nền
  tối ở cả hai theme nên một bảng màu (`sceneLabelStyle.js`) phủ cả hai; test kiểm: chữ hạng/tên/KPI trên
  nhãn, chip `+n`, `-n`, `Mới`, `!`, nhãn checkpoint, nhãn làn đều ≥ 4,5:1, viền trạng thái ≥ 3:1. Nút điều
  khiển (đo từ style tính toán, hai theme):

  | Thành phần | Sáng | Tối |
  |---|---|---|
  | Tuỳ chọn không chọn của nút phân đoạn trong cảnh | 13,6 | 8,4 |
  | Tuỳ chọn đang chọn / nút Replay | 14,6 | 11,9 |
  | Chú thích và liên kết "Xem dạng bảng" | 12,0 / 10,7 | 12,0 / 10,7 |

  **Phát hiện có sẵn từ trước:** tuỳ chọn không chọn của `.prr-segmented-limit .seg-btn` (màu
  `--text-secondary` trên `--surface-subtle`) chỉ đạt 4,42:1 (sáng) và 4,04:1 (tối), dưới AA. Mình chỉ
  sửa trong cảnh 3D (dùng `--text-primary`); thanh công cụ chung (2D/3D, Top 10/20/Tất cả) giữ nguyên để
  không đổi giao diện 2D.
- Nhãn vẽ trên canvas là trang trí (số liệu đầy đủ có ở bảng); lựa chọn Hub và Replay được thông báo qua
  vùng `aria-live`.

### Giải phóng tài nguyên

Rời module BXH thì cảnh bị gỡ (module không `keepMounted`) và react-three-fiber giải phóng bộ
vẽ (`forceContextLoss`). Hình học tự tạo (xe, mũi tên) được `dispose()` trong cleanup. Kiểm tra vào/ra
BXH 6 lần liên tiếp (5 lần quay lại): mọi ngữ cảnh WebGL cũ đều ở trạng thái đã mất (5/5), mỗi bộ vẽ
luôn 24 geometry và 3 texture, số chương trình không tăng, DOM luôn đúng 1 cặp canvas.

**Rò bộ nhớ khi rời tab BXH (đã sửa).** Mỗi lần vào rồi ra tab ở chế độ 3D, cả cây DOM của trang BXH
(~1.170 dòng bảng, ~3.300 SVG, ~6 MB bộ nhớ JS ở build production) vẫn nằm trong bộ nhớ.

- *Nguyên nhân.* three.js giữ **một texture dùng chung ở cấp module** (bảng tra DFG, `getDFGLUT()`) cho mọi vật
  liệu `MeshStandard`/`Lambert`/`Phong`. Mỗi `WebGLRenderer` gắn một trình nghe `dispose` lên texture đó, trình
  nghe đóng kín trên renderer ấy, và không ai gỡ nó khi renderer bị huỷ (`renderer.dispose()` không đụng tới texture
  dùng chung). Renderer cũ nhờ vậy vẫn truy cập được từ biến cấp module; renderer giữ canvas, và canvas giữ
  toàn bộ cây DOM đã gỡ của trang. Tìm ra bằng ảnh chụp heap (CDP): đường giữ đi từ `WebGLTexture` của renderer
  cũ qua một cặp `WeakMap` có khoá là `Source` của texture DFG (biến `rg` trong bundle).
- *Sửa.* `SharedTextureRelease` (trong `RoadScene3D.jsx`) lấy texture DFG từ uniform `dfgLUT` của một vật liệu đã
  vẽ (khi cảnh còn sống, vì lúc cleanup vật liệu đã bị gỡ) và gọi `dispose()` khi cảnh unmount. Sự kiện `dispose`
  kích hoạt và gỡ trình nghe; bản thân texture vẫn dùng được và được renderer kế tiếp tải lên lại.
- *Kết quả* (build production, 1.167 Hub, vào/ra BXH 6 lần, bộ nhớ JS sau GC): trước **21 → 49 MB** và số dòng
  bảng còn sống tăng 1.168 mỗi lần (1.168 → 7.008); sau **20 → 22 MB**, số dòng bảng luôn 1.168.
- *Chế độ 2D không rò* (16 → 17 MB; 63 → 64 MB ở dev). Số "2D cũng tăng 6,3 MB/lần" ghi ở bản đầu của mục này **sai**:
  đó là hiện tượng của bộ đo, xem dưới.
- *Dev server.* Ở `npm run dev`, 3D vẫn giữ các renderer cũ vì `react-refresh` (`helpersByRoot`) giữ mọi root của
  react-three-fiber; chỉ có ở dev, không có ở bản build.

**Cạm bẫy khi đo rò bộ nhớ bằng Playwright/CDP** (làm sai kết luận lần đầu): (1) `ElementHandle` trả về từ
`page.$()` / `page.waitForSelector()` giữ phần tử sống cho tới khi `dispose()`; dùng `page.evaluate` và
`locator.waitFor()` để kiểm tra tồn tại; (2) `Runtime.queryObjects` trả về mảng giữ toàn bộ đối tượng khớp, nên
phải gọi `Runtime.releaseObjectGroup` ngay sau khi đếm, nếu không chính phép đo giữ DOM sống và tạo ra "rò" giả.
Cách đếm đáng tin: `HeapProfiler.collectGarbage` hai lần rồi đọc `performance.memory.usedJSHeapSize` và số
`HTMLTableRowElement` còn sống (đã nhả đối tượng truy vấn), lặp lại vào/ra tab nhiều lần.

### Hạn chế đã biết

- Bảng 1.167 dòng là nguyên nhân chính khiến mọi thay đổi DOM trên trang tốn một lần vẽ lại cả trang;
  ảo hoá bảng (hoặc phân trang) sẽ cải thiện cả 2D lẫn 3D, nằm ngoài phạm vi sprint này.
- Lần mở 3D đầu tiên trên CPU chậm tốn nhiều giây (xem trên).
- "Tất cả" với 1.167 xe: mỗi xe chỉ vài điểm ảnh ở toàn cảnh; dùng zoom/bám xe và bảng.
- Chưa có đường lên lại chất lượng cao sau khi đã tụt bậc trong một lần xem.

### Kiểm tra Sprint 4

Playwright + Chrome (GPU thật) trên dữ liệu tổng hợp 1.167 Hub: bộ kiểm tra tương tác Sprint 2 (chọn, hover,
bàn phím, làn theo Vùng, "Tất cả") và bộ kiểm tra Replay/chuyển cảnh Sprint 3 chạy lại, đạt hết; bộ kiểm
tra Sprint 4 (đường lui, rò tài nguyên, chạm/mobile) đạt hết; mục bộ nhớ JS đã được sửa và đo lại (xem "Rò bộ nhớ khi rời tab BXH").
Ảnh: `docs/evidence/ranking-3d-sprint4/` (desktop sáng/tối, "Tất cả" 1.167 xe, làn theo Vùng, mobile
sáng/tối, cảnh mobile).

## Hoàn thiện hình ảnh (Sprint 5)

Quyết định chốt với người phụ trách: **giữ xe dựng bằng khối hình học** (không dùng `.glb`) và **chưa mở
BXH cho người dùng thường** (module `ranking` vẫn `requiresDevAdmin`; `moduleRegistry.jsx` không đổi).

### Những gì đã thêm

- **Nền theo theme** (`sceneThemes.js`). Bầu trời là một texture gradient 2×256 (`scene.background`) và
  sương mù (`fog`) bắt đầu xa hơn đường, nên xe không bị nhạt màu; nền đất là vật liệu không đổ sáng, mờ dần
  vào màu chân trời. Camera mặc định nhìn xuống đường nên ít khi thấy trời; chỉ khi xoay thấp xuống gần ngang
  mới thấy chân trời. Theme sáng: nền xanh xám nhạt, nhựa đường `#4b5a6e`; theme tối: nền navy `#0d1626`.
  Ánh sáng (bán cầu + đèn định hướng) cũng đổi theo theme. Màu cảnh đọc lại khi `<body>` đổi class `dark-mode`.
- **Cây và biển báo ven đường**, low-poly, đứng ở **phía xa** của đường (phía đối diện camera) để không bao giờ
  che xe hay nhãn. Cây thấp, màu dịu (xanh xám) để cam GHN và vàng SLA vẫn là màu nổi nhất. Vị trí xác định
  (hàm băm theo chỉ số), không đổi giữa các lần vẽ. Chỉ 4 `InstancedMesh` (thân, tán, cột, biển) bất kể số lượng.
- **Logo GHN trên thùng xe**: hai decal (hai bên thùng) dùng chung một texture 128×128 vẽ từ `/ghn-icon.svg`
  (cùng file với sidebar). Nếu tải ảnh lỗi thì decal chỉ trong suốt, cảnh vẫn dùng được.
- **Huy hiệu hạng 1–3** trên nóc thùng: đĩa vàng `#f5b800`, bạc `#b8c4d0`, đồng `#a0522d` (cùng sắc với vương miện
  của `DeliveryTruckIcon` 2D; bạc sáng hơn cho đủ tương phản trên nền tối). Một `InstancedMesh` tối đa 3 thể
  hiện, chạy theo xe khi Replay. Nhãn của xe hạng 1–3 có viền cùng màu huy hiệu.
- **Không có yếu tố đua xe F1**: không cờ caro, không bục podium, không vạch xuất phát/đích kiểu đua. Cổng
  "Điểm tiếp nhận & điều phối" và "Mốc chuẩn SLA" là cổng vận hành.
- Chi phí: thêm 8 `InstancedMesh` nhỏ (4 ven đường, 2 decal, 1 huy hiệu, nhưng decal tính vào bộ phận xe); sau thay
  đổi, xoay camera vẫn 143 fps (CPU ×1) / 91 fps (CPU ×4) với 120 Hub, 141 fps với 1.167 Hub trên GPU thật (dev).

### Rà soát bằng skill impeccable (critique + polish)

Bối cảnh: bề mặt Operate (đọc nhanh và chính xác quan trọng hơn trang trí), hệ thống thị giác có sẵn là
nguồn chuẩn (DESIGN.md "GHN KAS Operations"; chưa có PRODUCT.md nên chỉ chỉnh trong phạm vi hẹp). Đánh giá
chạy tách biệt: (A) nhận xét thiết kế từ ảnh chụp 8 trạng thái (sáng/tối × tổng quan/chân trời/bám xe/mobile) bởi
một agent chỉ đọc; (B) `impeccable detect` trên mã. **(B) không có phát hiện nào trong mã mới**; 7 cảnh báo
chống mẫu đều ở các dòng CSS có sẵn từ trước (`border-left` dày, `transition: width/padding`) ngoài phạm vi.

Kết luận của (A): cảnh ~60% mang bản sắc GHN (decal, sọc cam, cổng cam/vàng/cyan) và ~40% giống demo 3D chung
chung (cây xanh bão hoà, biển báo xanh nổi giữa đường, đĩa huy hiệu phẳng). Đã xử lý:

| Phát hiện | Xử lý |
|---|---|
| Cây che xe/nhãn, quá to và quá xanh | Chỉ đặt ở phía xa, nhỏ lại ~35%, đổi sang xanh xám dịu |
| Biển báo giữa đường trông như chướng ngại | Chuyển sang phía xa cùng cây |
| Huy hiệu hạng khó đọc, đồng trùng sắc cam của decal | Đổi màu (vàng/bạc/đồng đậm hơn), thêm viền cùng màu cho nhãn hạng 1–3 |
| Nền tối nuốt thùng xe | Nâng nền `#0d1626` và màu thùng `#2d3b50` |
| KPI luôn một màu, không mang trạng thái | Chữ KPI trên nhãn xanh/đỏ theo đạt mục tiêu (≥ 4,5:1, đã có test màu) |
| Hạng 2–4 không có nhãn ở tổng quan; cổng SLA mất nhãn | Hạng 1–3 luôn được ưu tiên nhãn; nhãn cổng ưu tiên cao hơn nhãn Top 10 còn lại |
| Nhãn nằm dưới nút/chú thích | Dải 34 px dưới cùng luôn trống nhãn |
| Đường chỉ chiếm ~60% bề ngang, thừa chiều cao | Khung hình sát hơn (phần dọc 11 → 8,5); trên canvas hẹp chỉ khung phần đầu đường (phía hạng 1), phần còn lại xoay/chụm để xem |
| Trạng thái đang chọn của nút yếu | Gạch chân cam GHN dưới tuỳ chọn đang chọn |
| Nút Replay giống nhãn, không có phân cấp | Có biểu tượng ▶, viền cyan 1,5 px, cách xa hai nút trạng thái |
| "Bám xe" bị khoá quá mờ | Độ mờ khoá 0,45 → 0,6 (tooltip đã có) |
| Mobile: canvas cao nhưng thừa chỗ trống | Chiều cao `clamp(240px, 44dvh, 340px)` |

**Chưa làm theo đề xuất (và lý do):** chip `+n` giữ nguyên dấu `+`/`-` vì phải khớp cột "Δ Hạng" của bảng và nhãn
2D; chưa thêm số hạng trên nóc thùng (cần thêm một lớp văn bản 3D, nhãn đã có số hạng); chưa đổi thùng sang màu
trắng ngà (đổi nhận diện xe so với 2D); ngưỡng "vàng" (sát mục tiêu) cho KPI cần định nghĩa nghiệp vụ, hiện chỉ
có đạt/chưa đạt; chưa đặt lại màu điểm báo cyan của header (ngoài phạm vi).

### Cách thêm một KPI mới

1. Thêm một mục vào `SUPPORTED_KPIS` trong `utils/performanceRanking.js` (`id`, `label`, `shortLabel`, `isDeli`,
   `defaultTarget`) và định nghĩa cách lấy tử số/mẫu số cho KPI đó ở cùng file (cột nguồn trong dòng dữ liệu).
   Mục tiêu có thể đến từ `TARGET_KPIS[label]` trong `data/defaultDataset.js`.
2. Không cần sửa gì ở cảnh 3D hay 2D: cả hai nhận `sceneTrucks` đã xếp hạng, `metricLabel` và `target` từ
   `calculatePerformanceRanking()`; tab chọn KPI và chú giải được dựng từ `SUPPORTED_KPIS`.
3. Thêm test cho KPI mới vào `utils/performanceRanking.test.mjs` (xếp hạng, nhóm đối soát chung, `deltaRank`).
4. Kiểm tra bằng Replay và chuyển cảnh khi đổi sang KPI mới (hạng trong nhóm đối soát phải cho `deltaRank` hợp lý).

### Kích thước bundle cuối

Build hiện tại (`npm run build`): `RoadScene3D-*.js` **961,7 kB (258,8 kB gzip)**, chỉ tải ở chế độ 3D;
`PerformanceRoadRanking-*.js` 26,2 kB (7,6 kB gzip); `index-*.js` 719,2 kB (224,7 kB gzip) gần như không đổi
so với trước dự án (704,9 kB lúc đầu, phần chênh do các thay đổi khác trên `main`). Chế độ 2D không tải chunk three.
So với Sprint 0: chunk 3D 912,6 → 961,7 kB (+49 kB) cho toàn bộ cảnh, tương tác, Replay, nhãn canvas, ven đường.

### Giới hạn đã biết (tổng hợp)

- Xe dựng bằng khối hình học, không phải mô hình thiết kế riêng.
- Mặc định 2D/3D theo `hardwareConcurrency > 4`; nhiều điện thoại mạnh mở thẳng 3D. Chưa thử trên điện thoại và
  máy ở hub thật (xem số đo ở Sprint 4: máy phát triển + mô phỏng).
- "Tất cả" với 1.167 xe: mỗi xe chỉ vài điểm ảnh ở toàn cảnh; dùng zoom, bám xe và bảng.
- Không GPU + "Tất cả": chậm (15 fps xoay); nên dùng Top 10/20 hoặc 2D.
- Mỗi thay đổi DOM trên trang tốn một lần vẽ lại cả trang vì bảng ~1.200 dòng (hitch khi bấm Replay); ảo hoá
  bảng nằm ngoài phạm vi.
- Replay dùng hạng trong nhóm đối soát chung và xấp xỉ quãng chạy khi chỉ hiện Top N (hướng luôn đúng).
- Nhãn trên canvas là trang trí đối với trình đọc màn hình; số liệu đầy đủ ở bảng.
- Cảnh 3D luôn dùng nền sáng/tối theo theme nhưng cảnh 2D vẫn là khung tối cố định như trước (giữ nguyên 2D).
- Nếu sau này đưa BXH vào `/snapshot` (n8n/Telegram) thì phải dùng `RoadScene2D` (trình duyệt ngầm không vẽ được WebGL).

### Kiểm tra Sprint 5

Playwright + Chrome (GPU thật), dữ liệu tổng hợp: bộ kiểm tra tương tác (Sprint 2), Replay/chuyển cảnh (Sprint 3),
đường lui/rò tài nguyên/chạm (Sprint 4) và độ tương phản nút điều khiển chạy lại sau các thay đổi, đều đạt.
Ảnh: `docs/evidence/ranking-3d-sprint5/` (sáng/tối × tổng quan, chân trời, bám xe hạng 1; mobile sáng/tối).
