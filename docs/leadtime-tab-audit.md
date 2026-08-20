# Audit tab 3 "Leadtime từng chặng" — 2026-08-20

Rà soát `src/components/Report6Leadtime.jsx` (1.235 dòng), `src/utils/leadtimeCalc.js`,
`src/data/leadtimeDataset.js`, đường ống dữ liệu (Supabase + Apps Script) và đối chiếu với
`docs/leadtime-tab-plan.md`. Mọi con số dưới đây đều đã đo/kiểm chứng thực tế, không suy đoán.

Xếp theo mức độ: **A = phải sửa trước khi dùng thật**, **B = làm sai/gây hiểu sai số liệu**,
**C = UX & design system**, **D = nợ kỹ thuật**.

---

## A. Chặn dùng thật (blocker)

### A1. Tab đang chạy 100% dữ liệu giả — chưa có đường ống dữ liệu thật
- Bảng `kas_leadtime_data` **không tồn tại** trên Supabase (`TTS Dashboard`,
  project `iyjsihwgnzcytbojvoom`). Đã kiểm bằng `information_schema.tables`: chỉ có
  `access_logs`, `capacity_reports`, `kas_ca1_data`, `kas_deli_data`, `kas_pick_data`,
  `v_kas_deli_agg`, `v_kas_pick_agg`.
  → File migration `supabase/migrations/20260820_create_kas_leadtime_data.sql` đã viết
  nhưng **chưa apply**.
- `scripts/apps-script/sync-to-supabase.gs:43-48`: gid tab leadtime vẫn đang bị comment
  (`// leadtime: <GID_CUA_TAB_LEADTIME>`) → Apps Script **không đẩy** dữ liệu leadtime.
- Hệ quả: `fetchAllRows('kas_leadtime_data')` luôn lỗi → bị `.catch` nuốt →
  `leadtimeData = null` → `App.jsx:176` giữ nguyên `createDefaultLeadtimeDataset()`.
  Nghĩa là mọi số trên tab 3 hiện tại là **số sinh bằng `Math.sin`/`Math.cos`**
  (`src/data/leadtimeDataset.js:54-92`), không phải số vận hành.
- Người dùng **không được cảnh báo gì**: không có badge "dữ liệu mẫu", không có ngày cập
  nhật. Ai mở tab 3 hôm nay đều đang đọc số bịa.

### A2. Danh mục lane hardcode 3 giá trị, trong khi dữ liệu thật có 5 — và so sánh phân biệt hoa/thường
`Report6Leadtime.jsx:37`
```js
const LANE_CATEGORIES = ['Intra city', 'Intra region', 'Cross region'];
```
`chartData` (dòng 174) và bảng chi tiết (dòng 428) so bằng `===` tuyệt đối.

Nhưng dữ liệu thật trong `kas_ca1_data` có **5** giá trị lane:
`Intra region` (378) · `Cross region` (378) · `Intra city` (369) · `Cross metro *` (70) ·
`Cross metro` (42).

→ Khi data leadtime thật lên, toàn bộ `Cross metro` và `Cross metro *` **biến mất khỏi chart**
và bị đổ vào nhóm "Khác" ở bảng (nhóm này không hề xuất hiện trên chart) → chart và bảng
không khớp nhau, và một phần sản lượng bị ẩn hoàn toàn.

Đáng chú ý: **repo đã từng bị đúng lỗi này và đã fix** ở tab 2 —
`Report5LaneCa1.jsx:140-145` ghi rõ:
> "an exact `===` match against `lanes` above silently matched nothing and every cell showed 0/–"
> → nên mới có hàm `normalizeLane()`.

Tab 3 lặp lại nguyên si sai sót đó, không tái dùng `normalizeLane`.

### A3. Chọn ngày không có data thì bị tự nhảy về ngày mới nhất, không báo gì
`Report6Leadtime.jsx:78-87` — effect re-sync ngày có điều kiện
`!allDates.includes(dateFilter.date)`.
Đã test thực tế: gõ `2026-06-01` vào input ngày → input **tự nhảy lại `2026-08-19`**.
Người dùng không thể xem bất kỳ ngày nào ngoài tập ngày đang load, và không hề có thông
báo "ngày này chưa có dữ liệu" — chỉ thấy ô ngày tự đổi, tưởng app lỗi.

### A4. Chế độ "Khoảng ngày" gần như không dùng được
Đo thực tế trên mock data (23 lane × 2 client × 30 ngày):
- Chế độ 1 ngày: bảng 49 dòng, trang cao 3.696px.
- Chế độ khoảng 7 ngày: bảng **325 dòng**, trang cao **19.670px** (≈20 màn hình cuộn).
- Với dữ liệu thật (109 dòng/ngày) → 7 ngày = **763 dòng**.

Tệ hơn: **bảng không có cột ngày**. Nên ở chế độ khoảng ngày, cùng một lane × client xuất
hiện 7 lần liền nhau với 7 bộ số khác nhau mà không cách nào biết dòng nào của ngày nào.

### A5. Hiệu năng: baseline tính lại toàn bộ dataset cho từng ô
`computeBaseline()` (`leadtimeCalc.js:103-172`) quét **toàn bộ** `leadtimeRows` và gọi
`new Date()` cho từng dòng, mỗi lần gọi. Component gọi nó `số dòng bảng × 4 chặng` lần
(dòng 425-435), cộng thêm `3 nhóm × 2 client × 4 chặng` cho chart.

Benchmark ở quy mô thật (109 dòng/ngày × 60 ngày = 6.540 dòng):

| Chế độ | Số lần gọi / 1 lần render | Thời gian block main thread |
|---|---|---|
| 1 ngày (109 dòng bảng) | 436 | **386 ms** |
| Khoảng 7 ngày (763 dòng bảng) | 3.052 | **2.710 ms** |

`useMemo` phụ thuộc `thresholdConfig`, nên **mỗi nhịp kéo slider** trong panel cấu hình đều
trả giá này. Kéo slider ở chế độ khoảng ngày = đứng máy ~2,7 giây mỗi bước.

---

## B. Số liệu sai hoặc gây hiểu sai

### B1. Baseline bị nhiễm chính dữ liệu đang xem (chế độ khoảng ngày)
`chartData` dòng 190: `asOf = dateFilter.endDate`. `computeBaseline` lấy cửa sổ
`[asOf - 28 ngày, asOf)`. Với khoảng ngày 12/8→19/8, các ngày 12→18/8 **nằm trong cả
kỳ đang xem lẫn baseline** → đang so số với chính nó. % lệch bị kéo về 0 một cách hệ thống,
cảnh báo gần như không bao giờ bật.

### B2. Drill-down 1 lane nhưng baseline vẫn là baseline cả nhóm
`chartData` dòng 191-198 luôn truyền `from: null, to: null, lane: laneCategory` —
**không quan tâm `selectedLanePair`**. Chọn drill-down "Hà Nội → Hồ Chí Minh" thì giá trị
hiện tại là của 1 lane đó, nhưng % lệch lại so với trung bình cả nhóm `Cross region`.
Hai số không cùng đơn vị so sánh → % lệch vô nghĩa.

Ngoài ra `from: null, to: null` làm nhánh "baseline theo lane cụ thể" (dòng 121-141)
**chết hẳn** — vì `r.fromprovince_new === null` không bao giờ đúng với dữ liệu thật (là
string). Luôn rơi xuống nhánh fallback. Code nhánh 1 chỉ để trưng.

### B3. Fallback baseline im lặng — UI không nói baseline đang ở cấp nào
Khi 1 lane có < `minDataPoints` ngày, baseline tự nhảy lên cấp nhóm lane
(`leadtimeCalc.js:143-171`) nhưng UI không đánh dấu gì. Người xem tưởng đang so lane với
chính lane đó, thực tế đang so lane với cả nhóm. **Giá trị baseline cũng không bao giờ được
hiển thị** — `meta.baseline` được tính, nhét vào state rồi không render ở đâu → không thể
kiểm chứng con số % lệch.

### B4. Chiều cao cột không phải leadtime E2E, nhưng không nói rõ
`stackedHeightByLaneGroup()` = tổng 4 weighted-avg, mỗi chặng có mẫu số riêng (đã loại
NULL riêng cho từng chặng). Trong khi bảng ngay bên dưới hiển thị cột `E2E` lấy trực tiếp
`avg_lt_e2e_hour`. Hai con số "tổng" khác nhau nằm cách nhau 200px, không có dòng nào giải
thích tại sao lệch → người xem sẽ nghĩ có chỗ tính sai.

### B5. Chỉ gắn cờ khi leadtime tăng; và +9% tăng lại tô màu xanh
`classifyDeviation()` (`leadtimeCalc.js:190-197`) chỉ so `pctDeviation >= warning/critical`.
Trong bảng (`Report6Leadtime.jsx:1103-1110`), lệch dưới ngưỡng dùng `#059669` — **xanh
"tốt"** — kể cả khi đó là `+9.1%` (leadtime **xấu đi** 9%). Xem screenshot thực tế: hàng
loạt `+1.4% / +9.1% / +10.6%` đều màu xanh, cột "Trạng thái" toàn bộ "Bình thường".
Cột trạng thái đang không mang thông tin nào.

Chưa xử lý chiều giảm bất thường (leadtime tụt 60% thường là lỗi data, không phải thành tích).

### B6. "MAU" là tên gọi sai
Cột `mau` trong SQL nguồn là **số mẫu / sản lượng đơn**. UI đặt tiêu đề cột là `MAU`
(dòng 1036, 1204) và header CSV cũng là `'MAU'` — đọc lên là "Monthly Active Users".
Người mới đọc báo cáo sẽ hiểu sai hoàn toàn. Nên là "Số đơn (mẫu)" / `sample_size`.

### B7. Segment NULL hiển thị giống hệt segment = 0
Plan (mục 3, test case 2) yêu cầu vẽ pattern gạch chéo cho chặng NULL toàn bộ.
`<pattern id="nullHatchPattern">` **đã khai báo ở dòng 907 nhưng không có chỗ nào dùng** —
grep toàn file chỉ ra 1 lần duy nhất (chính dòng khai báo). Lane như `Đà Nẵng → Đà Nẵng`
(NULL firstmile + middlemile) hiện ra là cột thấp hơn, không phân biệt được với
"chặng đó nhanh".

### B8. `undefinedh` khi thiếu cột E2E
Dòng 1142: `r.avg_lt_e2e_hour !== null ? ${r.avg_lt_e2e_hour}h : '–'`.
CSV thiếu cột → `undefined !== null` → render `undefinedh`. Phần "không xác định lane"
dùng `!= null` (đúng), phần bảng chính dùng `!== null` (sai) — không nhất quán.

### B9. Bộ lọc Client bị nhân đôi, bộ lọc Vùng/Loại hub thì lừa người dùng
- Header có `Client: SPB / SPE / Toàn bộ`; tab 3 lại có toggle SPB/SPE riêng bên trong.
  `App.jsx:485-492` **không truyền `clientFilter`** vào `Report6Leadtime` (plan mục 6 có yêu
  cầu truyền). Đổi client ở header → tab 3 không đổi gì. Hai nguồn sự thật cho cùng 1 khái niệm.
- Header vẫn hiện `Vùng` và `Loại Hub` khi đang ở tab 3, nhưng dữ liệu leadtime ở grain
  tỉnh-tỉnh, không có `region`/`hub` → 2 bộ lọc này **không tác động gì** mà vẫn sáng, vẫn
  bấm được. Người dùng lọc "Miền Bắc" rồi tin là số đã lọc.

---

## C. UX & design system

### C1. Không phân biệt được cột SPB với cột SPE — legend nói sai
Cả 2 stack dùng **chung 4 màu chặng** (`STAGE_CONFIG`: xanh/lục/cam/tím). Hai cột cạnh nhau
trong mỗi nhóm giống nhau như hai giọt nước. Legend dưới chart (dòng 970-984) lại ghi
"■ (cam) Cột 1: SPB" / "■ (xanh) Cột 2: SPE" — nhưng **không có cột nào màu cam hay xanh
đó cả**. Bỏ chọn 1 client thì "Cột 1/Cột 2" cũng sai theo.
Không có label client dưới trục X, không có `<Legend>` của recharts.

### C2. Tên client viết sai trong UI
Dòng 976 & 982: `SPB (Shopee Express Backlog)`, `SPE (Shopee Express Standard)`.
SPB = **Shopee Bulky**. Sai tên khách hàng ngay trên báo cáo gửi vận hành.

### C3. "Chẳng có chart gì" — 1.380 dòng dữ liệu ra 6 cột
Toàn tab chỉ có **một** chart: stacked bar 3 nhóm × 2 client. Trong đó:
- Không có chart theo thời gian — dù toàn bộ máy móc baseline/rolling 28 ngày đã được tính
  sẵn. Leadtime là chỉ số **xu hướng**, thiếu trend line là thiếu cái quan trọng nhất.
- Không có top-N lane tệ nhất (câu hỏi vận hành hay hỏi nhất).
- Không có so sánh D-1 vs D-8 / tuần này vs tuần trước như tab 1.
- Không có KPI card nào ở đầu tab (E2E toàn mạng, chặng đang tệ nhất, số lane vượt ngưỡng).
- Trục Y kéo tới 60h trong khi cột cao nhất ~45h → 25% khung chart trống.
- Chart cao cố định 380px, khoảng trắng hai bên rất lớn.

### C4. Không biết nhìn vào đâu — thiếu hoàn toàn tầng thông tin
Thứ tự hiện tại: tiêu đề → 3 nút hành động → 3 bộ lọc → (panel 7 thông số) → chart → bảng
49-325 dòng → bảng "không xác định lane". Không có câu trả lời nào ở trên cùng: hôm nay
leadtime bao nhiêu, tăng/giảm so hôm qua, chặng nào đang là nút thắt, lane nào cần xử lý.
Người mở tab phải tự đọc bảng để tự kết luận.

### C5. Panel "7 thông số" là console của dev, không phải công cụ vận hành
`baselineWindowDays`, `baselineMethod` (mean/median), `minDataPoints`,
`warningThresholdPct`, `criticalThresholdPct`, `lowSampleThreshold`, `highlightedStage` —
7 tham số thống kê phơi ra cho người dùng vận hành. Mở panel ra là đẩy chart tụt xuống
~250px. Thực tế cần: 1-2 preset ("nhạy / thường / chỉ báo nặng"), còn lại chốt cứng.

### C6. Ô nhập số không gõ được số 2 chữ số
Dòng 776: `Math.max(2, Number(e.target.value))`. Muốn nhập `15`: gõ `1` → giá trị bị đẩy
thành `2` ngay → gõ tiếp `5` thành `25`. **Không có cách nào nhập 15**. Ràng buộc `max="20"`
cũng không được enforce (gõ 25 vẫn nhận). Ô `lowSampleThreshold` (dòng 833) cùng kiểu lỗi.

### C7. Hai ngưỡng cảnh báo tự sửa lẫn nhau, không cảnh báo
`handleConfigChange` (dòng 138-150): kéo "Cảnh báo" lên ≥ "Nguy cấp" thì **tự động** đẩy
Nguy cấp = giá trị + 10 (và ngược lại trừ 10). Plan yêu cầu "validate + disable nếu nhập
ngược"; thực tế là âm thầm đổi con số bên cạnh — người dùng thấy slider mình không chạm tự
nhảy.

### C8. Bảng chi tiết bị lệch trái/phải, chữ dùng font mono
`index.css:1135-1140`: `table.mtx-table th, td { text-align: right; font-family: var(--font-mono) }`
— bảng này thiết kế cho ma trận số. Report6 chỉ set `textAlign:'left'` trên `<th>`
(dòng 1033-1034) mà **không set trên `<td>`** → tiêu đề canh trái, nội dung canh phải
(xem screenshot: "Intra city", "Hà Nội ➔ Hà Nội" bị dồn sang phải). Tên tỉnh render bằng
font monospace, đọc rất thô.

### C9. Cột "Nhóm Lane" lặp lại chính hàng group header
Mỗi group đã có hàng `📂 INTRA CITY (16 dòng dữ liệu)`, rồi mọi dòng bên dưới lại có cột
"Nhóm Lane" ghi "Intra city". Cột đó dư 100%.

### C10. Mobile không dùng được
Ở 390px: chart 3 nhóm bị nén trong ~330px, cột dính vào nhau và tràn khỏi khung; legend
chặng đè lên tiêu đề; các bộ lọc xếp dọc chiếm hết màn hình đầu; nút export (trước khi
bỏ) là khối primary to nhất trang. Bảng 10 cột không có cột đóng băng như `Report1`.

### C11. Design system: tab này lệch hẳn phần còn lại của app
| Tiêu chí | Report1 | Report5 | **Report6** |
|---|---|---|---|
| `style={{...}}` inline | 26 | 28 | **133** |
| Mã màu hex hardcode | 11 | 6 | **25** |
| Emoji trong heading | 0 | 0 | **11** (📊 📋 📂 📍 ➔) |

Thêm:
- Dùng 2 loại mũi tên lẫn lộn: dropdown drill-down build bằng `→` (dòng 100), bảng render
  bằng `➔` (dòng 1093) — cùng một khái niệm, hai ký tự.
- Bảng màu 4 chặng là Tailwind mặc định (`#3B82F6 #10B981 #F59E0B #8B5CF6`), không dính gì
  brand GHN (cam `#f15a22` / xanh `#0063aa`) trong `src/styles/tokens.css`.
- Tiêu đề viết Title Case Từng Chữ ("Bảng Chi Tiết Từng Tuyến") trong khi sidebar dùng
  sentence case ("1. 4 chỉ số nationwide"). Trộn Việt–Anh: "Lane drill-down",
  "Grouped by Lane × Stacked by Stage", "Cấu hình Ngưỡng (Threshold)", "Client", "E2E".
- ~12 cỡ chữ khác nhau (0.65rem → 1.25rem), 6 giá trị border-radius (3/4/6/8/10/12px) —
  không lấy từ token `--radius-control` / `--radius-surface`.
- `alert()` để thông báo copy ảnh thành công (dòng 236), trong khi `Report5` dùng state
  "đã copy" inline. Cùng hành động, hai kiểu feedback.
- Có thêm nút tròn đỏ thoát fullscreen riêng ở góc phải (z-index 9999) chồng lên nút
  Minimize2 sẵn có trên header.
- `htmlToImage.toPng(..., { backgroundColor: '#ffffff' })` — ở dark mode sẽ xuất ảnh
  **nền trắng + chữ sáng**, không đọc được.
- `stroke="#1e293b"` cho chặng nổi bật (dòng 943, 960) là màu tối cố định → ở dark mode
  viền tàng hình.

### C12. Không có empty state
`currentRows` rỗng (ngày trống, client bỏ chọn hết, drill-down không khớp) → chart vẽ trục
trắng, bảng render rỗng, không một dòng chữ "không có dữ liệu". Không phân biệt được
"chưa có data" với "app lỗi".

---

## D. Nợ kỹ thuật

- **D1.** Đặt tên lệch: sidebar hiển thị "3. Leadtime từng chặng" nhưng component là
  `Report6Leadtime`, tab id `report6`. Tab 2 = `Report5`. Không có tab nào 2,3,4.
- **D2.** `Report2TopSeller.jsx`, `Report3CaHub.jsx`, `Report4Focus1Vung.jsx` là **file
  chết** — không được import ở đâu (đã grep toàn `src/`). Tổng ~1.500 dòng code chết đang
  gây nhiễu chính chỗ này.
- **D3.** Bundle sau khi thêm recharts: **960 kB** (gzip 279 kB), 1 chunk duy nhất, không
  code-split. Người mở tab 1 vẫn phải tải toàn bộ recharts.
- **D4.** `shopee/leadtime_chang_deli.sql` — plan mục 2 yêu cầu đưa SQL nguồn vào repo,
  **chưa có**. Không ai review được cách tính từng mốc leadtime; cũng chưa xác nhận được
  các case NULL `firstmile`/`middlemile` (Đà Nẵng→Đà Nẵng, Đồng Nai→Đồng Nai) là lỗi data
  nguồn hay hành vi thật (plan mục 9 vẫn treo).
- **D5.** `dateFilter.startDate` mặc định lấy `allDates[length-7]` — phần tử thứ 7 tính từ
  cuối **trong tập ngày có data**, không phải "7 ngày lịch". Data khuyết ngày → khoảng thời
  gian không đúng như nhãn.
- **D6.** Ngày hardcode `'2026-08-19'` làm fallback ở 2 chỗ (dòng 72, 74).
- **D7.** `leadtimeCalc.js` dùng pattern `Number(config.x) || default` (dòng 106-108,
  187-188, 261) — giá trị `0` bị âm thầm thay bằng mặc định.
- **D8.** Tooltip (dòng 240-405, ~165 dòng JSX) luôn in **cả 2 client × 4 chặng × badge**
  bất kể đang hover cột nào, rộng 280-360px — một bức tường chữ.
- **D9.** Không có test nào cho `leadtimeCalc.js` dù đây là chỗ chứa toàn bộ logic
  weighted-average / baseline / classification. Plan mục 7 liệt kê 7 case cần verify, tất
  cả hiện đang phải test tay.

---

## Đã sửa trong nhánh này

`refactor(export): giữ duy nhất 1 nút xuất CSV ở header` (commit `961d993`)

Trước đó có **3** chỗ xuất CSV:
1. Nút "Xuất CSV" trên header (`Header.jsx:266-273`) — bắn `CustomEvent('export-csv')`.
2. Toolbar "Xuất dữ liệu Ca 1" + panel filter ở tab 2.
3. Nút "Tải CSV" trong tab 3.

Và nút ngoài **không hoạt động ở tab 3**: `Report1` và `Report5` có
`window.addEventListener('export-csv', ...)`, `Report6Leadtime` thì **không hề đăng ký** →
bấm nút ngoài khi đang ở tab Leadtime là bấm vào hư không.

Đã làm:
- `Report6Leadtime`: bỏ nút "Tải CSV" trong tab, thêm listener `export-csv`.
- `Report5LaneCa1`: bỏ toàn bộ export toolbar + panel (~127 dòng). Tab 2 giờ mở ra là vào
  luôn bảng số liệu.
- Kiểm chứng: dispatch `export-csv` ở cả 2 tab đều tải file thật
  (`GHN_Shopee_Leadtime_2026-08-19.csv`, `GHN_Shopee_Ca1_Lane_Matrix_2026-08-05.csv`),
  số nút CSV trong tab = 0.

Lưu ý: panel cũ ở tab 2 có bộ lọc riêng lúc export (lane / vùng giao / khoảng ngày). Phần
đó đã bỏ theo yêu cầu chỉ giữ 1 nút. Nếu cần lọc trước khi xuất thì nên đưa vào bộ lọc
chung của header, không dựng lại panel riêng trong tab.
