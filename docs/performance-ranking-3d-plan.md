# Plan: BXH Performance dạng 3D

> Cập nhật 2026-10-05. Tham khảo: airace.lol (three.js r180, WebGL2). Trang đó
> xếp các hãng AI thành xe đua trên một đường đua 3D, có góc máy quay và nút Replay.
>
> Mục tiêu: thay cảnh SVG/CSS trong
> `src/modules/performance-ranking/PerformanceRoadRanking.jsx` bằng một cảnh 3D
> "tuyến đường giao hàng GHN", **giữ nguyên** contract dữ liệu
> `calculatePerformanceRanking()` trong `src/utils/performanceRanking.js`.
>
> Cách dùng: mỗi sprint = 1 session Claude Code = 1 PR. Copy nguyên khối
> **Prompt** của sprint đó dán vào session mới. Làm xong sprint trước, merge,
> rồi mới chạy sprint sau.

---

## 0. Hiện trạng (đã kiểm tra trong code)

| Hạng mục | Hiện trạng |
|---|---|
| Module | id `ranking`, label "BXH Performance", lazy-load trong `src/modules/moduleRegistry.jsx`, đang để `requiresDevAdmin: true` |
| Dữ liệu | `calculatePerformanceRanking({ pickRows, deliRows, metricKey, clientFilter, selectedRegions, selectedHubTypes })` → `{ ranked, unranked, target, d1Date, d8Date, ... }` |
| Mỗi Hub (`ranked[i]`) | `id, hub, displayName, region, hubType, rank, kpiD1, sampleD1, kpiD8, deltaD8, hasCommonBaseline, cohortRankD1, cohortRankD8, deltaRank, isSmallSample, meetsTarget` |
| KPI | `p1st`, `popr` (Pick), `d1st`, `dodr` (Deli) trong `SUPPORTED_KPIS` |
| Cảnh hiện tại | SVG `DeliveryTruckIcon` trên đường CSS 4 làn. Vị trí ngang = `5% + (1 - idx/(n-1)) * 83%`, làn xen kẽ `[0, 2, 1, 3]` |
| Tương tác | `selectedHubId` đồng bộ giữa xe, bảng và panel chi tiết. Esc bỏ chọn. Nút "Mở chi tiết Hub" gọi `onJumpToReport1` |
| CSS | Class `prr-*` trong `src/index.css` (khoảng dòng 6398–6800), token ở `src/styles/tokens.css` |
| Snapshot | `src/snapshot/SnapshotPage.jsx` **không** render BXH, nên WebGL không ảnh hưởng ảnh gửi Telegram của n8n |
| Test | `npm test` chạy `node --test src/utils/*.test.mjs ...`. Đã có `src/utils/performanceRanking.test.mjs` |

## 1. Nguyên tắc

1. **Không đụng logic xếp hạng.** 3D chỉ là lớp hiển thị. Mọi con số vẫn lấy từ `calculatePerformanceRanking()`.
2. **Bảng là nguồn số liệu chính.** Cảnh 3D để trực quan hoá; trình đọc màn hình và người cần số chính xác dùng bảng.
3. **Luôn có đường lui 2D.** Không có WebGL2, máy yếu, hoặc người dùng chọn 2D thì dùng cảnh SVG hiện tại (tách thành component riêng, không xoá).
4. **Chủ đề giao hàng, không phải F1.** Code hiện có ghi rõ "no race track/F1 elements". Dùng xe tải GHN, đường, trạm kiểm soát, vạch SLA. Không dùng cờ caro, podium, hiệu ứng đua xe.
5. **Hàm thuần có test.** Tính vị trí, làn, màu nằm trong `src/utils/` để `node --test` chạy được, không phụ thuộc React hay three.
6. **three.js chỉ tải khi cần.** Cảnh 3D nằm trong một lazy chunk riêng. Chọn 2D thì không tải three.
7. **Không thêm serverless function.** Vercel Hobby giới hạn 12 function; dự án này chỉ chạy ở trình duyệt.
8. **Tài liệu kỹ thuật ghi vào `docs/` bằng tiếng Việt trong cùng PR** (thiết kế, đo đạc, an toàn).

## 2. Quyết định chốt

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Thư viện | `three` + `@react-three/fiber` v9 + `@react-three/drei` v10 | Dự án dùng React 19; R3F v9 là bản hỗ trợ React 19 |
| Mô hình xe | Dựng bằng khối hình học trong code (box, cylinder). File `.glb` là tuỳ chọn ở Sprint 5 | Không phụ thuộc asset ngoài, nhẹ, đổi màu theo trạng thái dễ |
| Số xe | Dùng `InstancedMesh` khi > 30 xe | Chế độ "Tất cả" có thể vài trăm Hub |
| Nhãn tên Hub | HTML phủ lên canvas (drei `<Html>`), chỉ cho Top N và xe đang chọn/hover | Chữ tiếng Việt sắc nét, tránh render hàng trăm DOM node |
| Trục dọc đường | Hạng (giữ quy tắc tiến độ theo `idx` như hiện tại) | Thứ tự đúng tuyệt đối; khoảng cách chỉ để dễ nhìn, giống airace |
| Làn | Mặc định xen kẽ 4 làn như cũ. Tuỳ chọn "Làn theo Vùng" ở Sprint 2 | Số vùng thay đổi theo filter; xen kẽ tránh xe chồng nhau |
| Màu | Đạt mục tiêu / chưa đạt dùng token sẵn có; thùng xe giữ cam GHN `#f15a22` | Thống nhất với legend hiện tại |
| Mặc định 2D/3D | 3D nếu có WebGL2 và `navigator.hardwareConcurrency > 4`; ngược lại 2D. Lựa chọn của người dùng lưu `localStorage` (bọc try/catch) | Tránh làm chậm máy yếu ở hub |
| Giảm chuyển động | `prefers-reduced-motion: reduce` thì vẫn hiện 3D tĩnh, tắt Replay tự chạy và camera bay | Tôn trọng cài đặt hệ điều hành |

## 3. Câu hỏi cần chốt trước khi làm Sprint 5

- Có mở BXH cho người dùng thường không (bỏ `requiresDevAdmin`)? Việc này **không** nằm trong plan, cần người phụ trách quyết.
- Có cần mô hình xe `.glb` thật (thiết kế riêng) hay giữ xe dựng bằng khối hình học?

---

## Sprint 0 — Khung, thư viện, công tắc 2D/3D

**Mục tiêu:** Có công tắc 2D/3D, phát hiện WebGL, lazy chunk riêng cho 3D (tạm hiển thị một cảnh trống), đo kích thước bundle. Giao diện 2D không đổi.

**Prompt:**

```text
Mình đang làm BXH Performance dạng 3D theo plan ở docs/performance-ranking-3d-plan.md.
Đọc plan đó trước (mục 0–2), rồi làm Sprint 0.

Việc cần làm:
1. Cài three, @react-three/fiber@^9, @react-three/drei@^10 (tương thích React 19).
2. Tách phần cảnh SVG hiện tại trong
   src/modules/performance-ranking/PerformanceRoadRanking.jsx (DeliveryTruckIcon +
   khối .prr-road-viewport) thành component riêng
   src/modules/performance-ranking/RoadScene2D.jsx. Props: sceneTrucks,
   selectedHubId, onSelectHub. Hành vi và giao diện 2D phải giữ nguyên 100%,
   kể cả cuộn tới xe đang chọn.
3. Tạo src/utils/sceneCapability.js (hàm thuần, không import React/three):
   - detectWebGL2(createCanvas) nhận factory để test được.
   - pickDefaultSceneMode({ webgl2, cores, reducedMotion, saved }) trả '2d' | '3d'
     theo quy tắc ở mục 2 của plan.
   Viết test src/utils/sceneCapability.test.mjs.
4. Tạo src/modules/performance-ranking/RoadScene3D.jsx, nạp bằng React.lazy
   (chunk riêng). Tạm thời chỉ render <Canvas> có nền + một mặt đường phẳng.
5. Thêm segmented control "2D / 3D" vào thanh .prr-scene-toolbar. Nếu không có
   WebGL2 thì disable nút 3D và có tooltip giải thích. Lưu lựa chọn vào
   localStorage key 'ghn.ranking.sceneMode', bọc try/catch.
6. Dùng Suspense fallback giống skeleton đang có trong dự án (docs/loading-states.md).
7. Chạy npm run build, ghi kích thước chunk trước/sau vào
   docs/performance-ranking-3d.md (file mới, tiếng Việt, mục "Đo bundle").
   Xác nhận chế độ 2D không tải chunk three.

Ràng buộc: không sửa src/utils/performanceRanking.js. Không thêm file trong api/.
Chạy npm test và npm run lint phải pass. Kiểm tra trên trình duyệt cả 2 chế độ
(xem docs/local-preview.md), cả theme sáng và tối.
```

**Xong khi:** 2D giống hệt trước; bật 3D thấy canvas; `npm test`, `npm run lint`, `npm run build` pass; có số đo bundle trong docs.

---

## Sprint 1 — Cảnh 3D tĩnh: đường, làn, xe, camera toàn cảnh

**Mục tiêu:** Cảnh 3D hiển thị đúng thứ hạng từ dữ liệu thật, đọc được ngay mà chưa cần tương tác.

**Prompt:**

```text
Tiếp tục plan docs/performance-ranking-3d-plan.md, làm Sprint 1. Sprint 0 đã merge
(có RoadScene2D, RoadScene3D lazy, công tắc 2D/3D).

Việc cần làm:
1. Tạo src/utils/rankingSceneLayout.js (hàm thuần, không import three):
   computeSceneLayout(sceneTrucks, { roadLength, laneCount = 4, laneWidth })
   → mảng { id, x, z, lane, progress } theo đúng quy tắc của cảnh 2D hiện tại:
   progress = 1 - idx/(n-1) (n=1 thì 0.5), dải [0.05, 0.88] chiều dài đường,
   làn xen kẽ [0, 2, 1, 3]. Viết test src/utils/rankingSceneLayout.test.mjs:
   thứ tự đơn điệu theo rank, không ra ngoài đường, n=0/1/2/200, xe đang chọn nằm
   ngoài Top N vẫn có vị trí.
2. Trong RoadScene3D.jsx dựng:
   - Mặt đường dài, 4 làn, vạch kẻ đứt; lề đường đơn giản.
   - "Điểm tiếp nhận & điều phối" ở đầu đường, "Mốc chuẩn SLA" ở cuối (cổng/vạch),
     giống nội dung checkpoint ở cảnh 2D. Không dùng yếu tố đua xe F1.
   - Xe tải GHN dựng bằng khối hình học (thùng + cabin + 3 bánh), sọc cam #f15a22.
     Màu cabin hoặc đèn theo meetsTarget, dùng màu đọc từ CSS token
     (getComputedStyle) để theo theme sáng/tối.
   - Dùng InstancedMesh khi số xe > 30.
   - Camera toàn cảnh góc nghiêng ~35°, tự fit theo số xe; OrbitControls giới hạn
     góc (không xoay xuống dưới mặt đường, không zoom quá xa).
   - Ánh sáng: 1 hemisphere + 1 directional có bóng mềm (tắt bóng khi > 60 xe).
3. Chỉ render khi cần (frameloop="demand") để không tốn CPU lúc đứng yên.
4. Nối dữ liệu: dùng đúng sceneTrucks và sceneDisplayLimit (Top 10/20/Tất cả)
   đang có trong PerformanceRoadRanking.jsx. Đổi KPI hoặc filter thì cảnh cập nhật.
5. Trạng thái rỗng (scopeEmpty, không có xe) dùng lại khối .prr-scene-empty hiện có.

Ràng buộc: không sửa logic trong src/utils/performanceRanking.js. npm test, lint,
build pass. Chụp ảnh 3D ở Top 10, Top 20, Tất cả (sáng + tối) vào
docs/evidence/ranking-3d-sprint1/ và cập nhật docs/performance-ranking-3d.md
(mục "Cách thể hiện dữ liệu").
```

**Xong khi:** Thứ tự xe trên 3D khớp bảng 100% ở cả 4 KPI; test layout pass; có ảnh chụp chứng minh.

---

## Sprint 2 — Tương tác: chọn xe, nhãn, camera bám theo

**Mục tiêu:** Dùng được như cảnh 2D: bấm xe để xem chi tiết, đồng bộ với bảng.

**Prompt:**

```text
Tiếp tục plan docs/performance-ranking-3d-plan.md, làm Sprint 2. Sprint 1 đã có
cảnh 3D tĩnh đúng thứ hạng.

Việc cần làm:
1. Bấm vào xe (raycast, chạy được với InstancedMesh qua instanceId) gọi
   onSelectHub(id). Bấm lại thì bỏ chọn. Esc bỏ chọn (đã có sẵn ở component cha).
   Chọn từ bảng thì xe tương ứng được đánh dấu trong 3D. Đồng bộ hai chiều.
2. Hover: con trỏ pointer, xe nhô nhẹ lên, hiện tooltip HTML nhỏ (tên, hạng, KPI).
3. Nhãn HTML (drei <Html>) phía trên xe cho Top 10 và xe đang chọn: #hạng, tên Hub,
   KPI D-1 (1 chữ số thập phân), deltaRank (+/-, "Mới" khi
   hasCommonBaseline === false), dấu "!" khi isSmallSample. Dùng lại class
   .prr-truck-tag* để giống giao diện 2D. Nhãn không được che nhau quá mức:
   ẩn nhãn của xe ở xa camera.
4. Camera:
   - Chế độ "Toàn cảnh" (mặc định) và "Bám xe". Chọn xe thì camera bay mượt tới
     xe đó (bỏ hiệu ứng bay khi prefers-reduced-motion).
   - Thêm nút "Toàn cảnh" để quay về.
5. Tuỳ chọn "Làn theo Vùng": chia làn theo region của các Hub trong cảnh (tối đa 6
   làn, vùng thứ 7 trở đi gộp "Khác"). Viết thêm test cho chế độ này trong
   rankingSceneLayout.test.mjs.
6. Bàn phím: khi canvas đang focus, ← → chuyển sang xe hạng kế bên, Enter mở
   panel chi tiết. Canvas có aria-label mô tả và trỏ người dùng tới bảng.
7. Nút "Mở chi tiết Hub" trong panel chi tiết hoạt động như cũ.

Ràng buộc: npm test, lint, build pass. Thử trên trình duyệt: chọn từ xe, từ bảng,
từ ô tìm kiếm; đổi KPI khi đang chọn xe (phải bỏ chọn như hành vi hiện tại).
Cập nhật docs/performance-ranking-3d.md (mục "Tương tác").
```

**Xong khi:** Mọi luồng chọn Hub chạy giống 2D; bàn phím dùng được; không lỗi console.

---

## Sprint 3 — Replay D-8 → D-1 và chuyển KPI có chuyển động

**Mục tiêu:** Bản tương đương nút Replay của airace, nhưng có ý nghĩa vận hành: thấy Hub nào lên/xuống hạng so với tuần trước.

**Prompt:**

```text
Tiếp tục plan docs/performance-ranking-3d-plan.md, làm Sprint 3. Sprint 2 đã có
tương tác chọn xe và camera.

Việc cần làm:
1. Trong src/utils/rankingSceneLayout.js thêm computeReplayFrames(sceneTrucks, opts):
   - Vị trí bắt đầu dựa trên cohortRankD8, vị trí kết thúc dựa trên cohortRankD1
     (chỉ những Hub có hasCommonBaseline).
   - Hub không có baseline D-8 ("Mới"): bắt đầu ở điểm tiếp nhận, mờ dần hiện ra.
   - Trả về { id, from: {x,z}, to: {x,z}, isNew }.
   Viết test: Hub lên hạng có to.x > from.x, Hub mới có isNew, không NaN.
2. Nút "Replay D-8 → D-1" trên toolbar 3D. Thời lượng ~3s, easing mượt
   (gsap đã có trong dependencies, hoặc tự nội suy trong useFrame).
   Trong lúc chạy hiện nhãn ngày đang chuyển (dùng d8Date/d1Date đã format).
   Xe lên hạng có mũi tên xanh, xuống hạng mũi tên đỏ trên nóc trong 2s cuối.
3. Lần đầu mở tab ở chế độ 3D thì tự chạy Replay một lần. Không tự chạy khi
   prefers-reduced-motion (vẫn cho bấm nút).
4. Đổi KPI hoặc đổi filter: xe chạy mượt từ vị trí cũ sang vị trí mới (~0.8s),
   Hub mới xuất hiện / Hub bị loại mờ đi. Khi reduced-motion thì nhảy thẳng.
5. Trong lúc animation chạy mới dùng frameloop liên tục; xong thì về "demand".

Ràng buộc: không sửa src/utils/performanceRanking.js. npm test, lint, build pass.
Quay GIF ngắn hoặc chuỗi ảnh vào docs/evidence/ranking-3d-sprint3/. Cập nhật
docs/performance-ranking-3d.md (mục "Replay", giải thích rõ Replay dùng hạng trong
nhóm đối soát chung cohortRank, không phải rank toàn bộ).
```

**Xong khi:** Replay khớp cột "thăng/tụt hạng" trong bảng; reduced-motion không có animation tự chạy.

---

## Sprint 4 — Hiệu năng, mobile, đường lui, khả năng tiếp cận

**Mục tiêu:** Chạy ổn trên máy văn phòng ở hub và trên điện thoại (module có bật navigation mobile).

**Prompt:**

```text
Tiếp tục plan docs/performance-ranking-3d-plan.md, làm Sprint 4. Đã có 3D đầy đủ
tính năng (tĩnh, tương tác, Replay).

Việc cần làm:
1. Đo hiệu năng ở chế độ "Tất cả" với dữ liệu thật (ghi số Hub). Đo FPS khi xoay
   camera và khi Replay, thời gian mở tab tới khi thấy xe, bộ nhớ GPU ước tính.
   Đo trên desktop và mô phỏng mobile (375x812). Ghi vào
   docs/performance-ranking-3d.md (mục "Đo hiệu năng").
2. Tối ưu nếu FPS < 45 khi Replay:
   - dpr={[1, 1.5]}, tắt bóng đổ trên mobile hoặc khi > 60 xe;
   - drei <PerformanceMonitor> giảm chất lượng tự động;
   - gộp geometry tĩnh (đường, vạch kẻ) thành ít draw call.
3. Mobile: canvas cao vừa màn hình (không đẩy bảng xuống quá xa), chạm để chọn xe,
   kéo một ngón để xoay, hai ngón để zoom. Cuộn trang không bị canvas giữ lại
   (touch-action phù hợp). Nhãn HTML thu gọn.
4. Đường lui:
   - Mất WebGL context (webglcontextlost) thì tự chuyển sang 2D và báo nhẹ.
   - Lỗi khi tải chunk 3D thì ErrorBoundary chuyển sang 2D.
   - Tab trình duyệt bị ẩn thì dừng render.
5. Khả năng tiếp cận: canvas có role="img" + aria-label tóm tắt (KPI, số Hub, Top 3),
   có link "Xem dạng bảng" nhảy tới bảng. Kiểm tra độ tương phản nhãn ở cả 2 theme.
6. Giải phóng tài nguyên khi rời tab: dispose geometry/material/texture, kiểm tra
   không rò bộ nhớ khi chuyển qua lại giữa các module 5 lần.

Ràng buộc: npm test, lint, build pass. Ảnh chụp mobile + desktop vào
docs/evidence/ranking-3d-sprint4/.
```

**Xong khi:** FPS đạt ngưỡng hoặc có giải thích lý do; mất WebGL tự về 2D; mobile dùng được.

---

## Sprint 5 — Hoàn thiện hình ảnh và tài liệu

**Mục tiêu:** Cảnh đẹp, thống nhất với thương hiệu GHN, tài liệu đầy đủ để bàn giao.

**Prompt:**

```text
Tiếp tục plan docs/performance-ranking-3d-plan.md, làm Sprint 5 (cuối). Đã xong
hiệu năng và mobile ở Sprint 4.

Trước khi làm, hỏi mình 2 câu ở mục 3 của plan (mở cho người dùng thường? dùng
model .glb hay giữ xe dựng bằng khối?). Làm theo câu trả lời.

Việc cần làm:
1. Hình ảnh: chỉnh ánh sáng, bầu trời/nền theo theme sáng/tối, cây/biển báo ven
   đường đơn giản (low-poly, ít draw call), logo GHN trên thùng xe (texture nhỏ).
   Xe hạng 1–3 có huy hiệu nóc màu vàng/bạc/đồng như DeliveryTruckIcon 2D.
   Không dùng yếu tố đua xe F1.
2. Nếu chọn .glb: nạp bằng useGLTF, nén Draco/Meshopt, kích thước file < 300KB,
   vẫn đổi màu theo meetsTarget được. Ghi nguồn và giấy phép asset vào docs.
3. Rà soát visual bằng skill impeccable (critique + polish) cho cảnh 3D và toolbar.
4. Hoàn thiện docs/performance-ranking-3d.md: kiến trúc (component, hàm thuần,
   lazy chunk), cách thể hiện dữ liệu, tương tác, Replay, đường lui, số đo bundle
   và hiệu năng cuối, cách thêm KPI mới, giới hạn đã biết.
5. Nếu được đồng ý mở cho người dùng thường: bỏ requiresDevAdmin của module
   'ranking' trong src/modules/moduleRegistry.jsx trong một commit riêng.

Ràng buộc: npm test, lint, build pass. Ảnh chụp cuối vào
docs/evidence/ranking-3d-sprint5/.
```

**Xong khi:** Tài liệu đủ để người khác bảo trì; ảnh chụp cuối ở cả 2 theme và mobile.

---

## 4. Rủi ro

| Rủi ro | Ảnh hưởng | Cách xử lý |
|---|---|---|
| Máy ở hub yếu, không có GPU rời | Giật, nóng máy | Mặc định 2D trên máy ≤ 4 nhân; `frameloop="demand"`; PerformanceMonitor |
| Bundle tăng | Mở tab BXH chậm hơn | Lazy chunk riêng, 2D không tải three; đo ở Sprint 0 và Sprint 4 |
| Nhãn chồng nhau khi nhiều xe | Khó đọc | Chỉ gắn nhãn Top 10 + xe đang chọn; tooltip khi hover |
| Người xem hiểu sai khoảng cách giữa xe là chênh lệch KPI | Kết luận sai | Ghi rõ trên toolbar: "Vị trí thể hiện thứ hạng, không tỉ lệ với KPI" |
| Sau này đưa BXH vào `/snapshot` | Trình duyệt chạy ngầm không vẽ được WebGL | Snapshot luôn dùng `RoadScene2D` |
