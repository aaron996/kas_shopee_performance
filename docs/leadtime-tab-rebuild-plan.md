# Plan build lại tab 3 "Leadtime từng chặng"

> Trạng thái: PLAN — chưa code.
> Đầu vào: `docs/leadtime-tab-audit.md` (32 vấn đề đã kiểm chứng).
> Thay thế: `docs/leadtime-tab-plan.md` (plan v1 — giữ lại làm tham chiếu rule tính toán).
> Mỗi mục dưới đây đều ghi rõ nó đóng vấn đề nào trong audit (`A1`, `B5`, `C11`...).

---

## 0. Nguyên tắc

1. **Không nối được data thật thì không build UI tiếp.** Mọi thứ đang đẹp trên tab 3 hiện tại
   đều là số `Math.sin` (A1). Phase 0 phải xong trước.
2. **Lane = `externallane_new`.** Cặp tỉnh `from → to` là tầng drill-down thứ 2, không phải
   trục chính (A2b).
3. **Không hardcode danh mục.** Lane, client, ngày — tất cả lấy động từ data (A2).
4. **Tầng thông tin trước, biểu đồ sau.** Mở tab ra phải trả lời được 3 câu trong 5 giây:
   hôm nay bao nhiêu giờ, so kỳ trước tăng/giảm, chặng nào + lane nào đang là nút thắt (C4).
5. **Dùng lại design system đang có** (`src/styles/tokens.css`, class `.metric-block`,
   `.kpi-card`, `.mtx-table`), không viết inline style mới (C11).
6. **Mỗi con số hiển thị phải kiểm chứng được**: đã lệch bao nhiêu % thì phải nói baseline là
   bao nhiêu và ở cấp nào (B3).

---

## 1. Quyết định chốt

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Sửa tại chỗ hay viết mới? | **Viết mới** `src/components/ReportLeadtime/` (nhiều file nhỏ), xoá `Report6Leadtime.jsx` khi xong | File cũ 1.235 dòng, 133 inline style, logic và UI trộn lẫn — vá tốn hơn viết lại |
| Nguồn client filter | **Header là nguồn duy nhất** (`clientFilter`: SPB / SPE / ALL), bỏ toggle SPB/SPE trong tab | B9 — đang có 2 nguồn sự thật cho cùng 1 khái niệm |
| Bộ lọc Vùng / Loại Hub khi ở tab 3 | **Ẩn** (không disable) | Không tác động gì tới data grain tỉnh-tỉnh mà vẫn sáng → lừa người dùng (B9) |
| So sánh SPB vs SPE | **Small multiples** — 2 chart cạnh nhau, mỗi chart 1 client; không xếp 2 stack lẫn trong 1 nhóm | C1 — 2 stack dùng chung 4 màu chặng thì không thể phân biệt |
| Panel 7 thông số | Thu về **3 preset** (Chặt / Thường / Lỏng) + panel nâng cao chỉ hiện cho `isDevAdmin` | C5, C6, C7 |
| Chart library | Giữ `recharts`, nhưng **lazy-load** cả tab | D3 — recharts đang nằm trong chunk chính 960kB |
| Test framework | **`node --test`** (built-in Node 22), file `*.test.mjs`, không thêm dependency | D9 — `leadtimeCalc` là ESM thuần, import trực tiếp được |
| Tên component / tab id | Đổi `report6` → `report3`, `Report6Leadtime` → `ReportLeadtime` | D1 — sidebar ghi "3." nhưng code là 6 |

---

## 2. Phase 0 — Nối data thật (BLOCKER, làm trước tiên)

Đóng: **A1**.

### 2.1 Apply migration lên Supabase
`supabase/migrations/20260820_create_kas_leadtime_data.sql` đã viết đúng, chỉ chưa chạy.
- Apply lên project `iyjsihwgnzcytbojvoom` (TTS Dashboard).
- Verify: `select count(*) from kas_leadtime_data` chạy được; RLS cho phép `authenticated`
  select; `sync_kas_leadtime_data` chỉ `service_role` được execute.

### 2.2 Bật sync trong Apps Script
`scripts/apps-script/sync-to-supabase.gs:43-48` — bỏ comment và điền gid thật:
```js
const TAB_GIDS = {
  pick: 1312031199,
  deli: 940798880,
  ca1: 1405399014,
  leadtime: <GID_TAB_LEADTIME>   // ← cần Vinh cung cấp
};
```
- Chạy `syncAllTabs()` thủ công 1 lần, kiểm số dòng vào bảng khớp số dòng sheet.
- Cập nhật `docs/google-sheet-supabase-sync.md` thêm mục tab leadtime.

### 2.3 Đưa SQL nguồn vào repo
Đóng: **D4**.
- Đặt `shopee/leadtime_chang_deli.sql`.
- Review lại cách tính từng mốc, đặc biệt **xác nhận case NULL** `firstmile`/`middlemile` ở
  các lane intra-city (Đà Nẵng→Đà Nẵng, Đồng Nai→Đồng Nai): là thiếu mốc thời gian ở nguồn,
  hay là hành vi thật (đơn không qua chặng đó)? Câu trả lời quyết định UI xử lý thế nào ở 4.6.

### 2.4 Không bao giờ để người dùng đọc số mẫu mà không biết
Đóng: **A1 (phần cảnh báo)**.

`src/App.jsx`:
```js
const [leadtimeSource, setLeadtimeSource] = useState('mock'); // 'mock' | 'supabase' | 'csv'
// handleSyncLiveSheet: if (supaRes.leadtimeData) { setLeadtimeRows(...); setLeadtimeSource('supabase'); }
// DataSourceManagerModal upload → setLeadtimeSource('csv')
```
Truyền `leadtimeSource` + `syncedAt` xuống tab. Tab render banner cố định trên cùng khi
`leadtimeSource === 'mock'`:
> ⚠ Đang hiển thị **dữ liệu mẫu** (không phải số vận hành). Chưa đồng bộ được
> `kas_leadtime_data`.

Dùng component sẵn có `src/components/ui/StatusNotice.jsx`, không tự dựng box mới.

`src/utils/supabaseSheetSync.js`: hiện `.catch` nuốt lỗi im lặng — giữ nguyên hành vi không
throw (đúng), nhưng **trả thêm** `leadtimeError` để UI phân biệt "bảng rỗng" với "bảng không
tồn tại".

---

## 3. Phase 1 — Nền tảng tính toán

### 3.1 Taxonomy lane dùng chung
Đóng: **A2**, và dọn luôn phần trùng lặp ở tab 2 (C11).

File mới `src/utils/laneTaxonomy.js`:
```js
// Sheet nguồn viết lane không nhất quán ("Intra city" / "Intra City" / "Cross metro *").
// Chuẩn hoá 1 chỗ duy nhất cho toàn app. Report5LaneCa1 đang có bản copy riêng — xoá đi,
// import từ đây.
export function normalizeLane(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

// Thứ tự trình bày (gần → xa). Lane lạ không có trong list vẫn được giữ, xếp cuối.
export const LANE_DISPLAY_ORDER = [
  'intracity', 'intraregion', 'crossmetro', 'crossmetro*', 'crossregion'
];

// Lấy danh mục lane THỰC TẾ có trong data, đã sort theo LANE_DISPLAY_ORDER.
// → không bao giờ mất lane vì hardcode thiếu.
export function getLanesFromRows(rows, field = 'externallane_new') { ... }

// Nhãn hiển thị: lấy dạng viết đầu tiên gặp trong data (giữ nguyên chữ của nguồn).
export function getLaneLabel(normalizedKey, rows) { ... }
```
Refactor `Report5LaneCa1.jsx`: xoá `normalizeLane` local + `const lanes = [...]` hardcode
5 giá trị, import từ `laneTaxonomy`.

**Acceptance:** thêm 1 dòng data với lane `"CROSS METRO"` (hoa toàn bộ) → vẫn gộp đúng vào
nhóm `Cross metro`, xuất hiện trên cả chart lẫn bảng.

### 3.2 Viết lại engine baseline
Đóng: **A5**, **B1**, **B2**, **B3**.

Vấn đề hiện tại: `computeBaseline()` quét toàn bộ `leadtimeRows` + `new Date()` mỗi dòng,
mỗi lần gọi → 2.710ms/render ở chế độ khoảng ngày.

Cách làm: **index 1 lần, tra cứu O(số ngày cửa sổ)**.

`src/utils/leadtimeCalc.js` (v2):
```js
/**
 * Index toàn bộ dataset 1 lần duy nhất (useMemo theo leadtimeRows).
 * Cấu trúc: Map<scopeKey, Map<dateStr, {[stageKey]: {sumProd, sumMau}}>>
 *   scopeKey cấp lane   : `${client}|${laneKey}`
 *   scopeKey cấp tuyến  : `${client}|${laneKey}|${from}→${to}`
 * Không dùng new Date() — report_date dạng 'YYYY-MM-DD' so sánh string là đủ và đúng.
 */
export function buildLeadtimeIndex(rows) { ... }

/**
 * Cửa sổ baseline = [periodStart - windowDays, periodStart) — LOẠI TRỪ toàn bộ kỳ đang xem,
 * không phải chỉ loại trừ endDate như bản cũ (đóng B1).
 * Trả về { value, level, dayCount } với level = 'lane-pair' | 'lane' | null:
 *   - thử cấp tuyến trước; nếu số ngày có data < minDataPoints thì fallback cấp lane
 *   - level được trả ra để UI HIỂN THỊ, không fallback im lặng (đóng B3)
 */
export function resolveBaseline(index, { client, laneKey, from, to, stageKey, periodStart }, config) { ... }
```
Quy tắc so sánh **cùng đơn vị** (đóng B2):
- Giá trị hiện tại ở cấp nào thì baseline phải ở cấp đó. Drill-down 1 tuyến → baseline cấp
  tuyến (hoặc cấp lane nhưng **có nhãn "baseline cấp nhóm"**).
- Bỏ hẳn kiểu truyền `from: null, to: null` để rồi rơi vào fallback — gọi đúng scope ngay từ
  đầu.

Ngân sách hiệu năng — **acceptance đo được**:
| Chế độ | Hiện tại | Mục tiêu |
|---|---|---|
| 1 ngày, 109 dòng bảng | 386 ms | **< 30 ms** |
| Khoảng 7 ngày, 763 dòng | 2.710 ms | **< 80 ms** |
Đo bằng script `scripts/bench-leadtime.mjs` (viết mới, chạy `node` thuần như bench trong audit).

### 3.3 Phân loại lệch 2 chiều
Đóng: **B5**.
```js
// Trả { pctDeviation, level, direction }
//   level: 'normal' | 'warning' | 'critical'
//   direction: 'up' (leadtime xấu đi) | 'down' (tốt hơn) | 'flat'
// - Tăng vượt ngưỡng → warning/critical (như cũ).
// - Giảm bất thường quá `anomalyDropPct` (mặc định 40%) → level 'critical', direction 'down',
//   nhãn "nghi lỗi data" — leadtime tụt 60% gần như luôn là thiếu mốc thời gian, không phải thành tích.
// - Tăng dưới ngưỡng KHÔNG được tô xanh "tốt": dùng màu trung tính (--text-secondary).
//   Chỉ direction 'down' trong biên hợp lý mới tô xanh.
export function classifyDeviation(current, baseline, config) { ... }
```
Bảng màu lấy từ token: `--status-success-fg` / `--status-warning-fg` / `--status-danger-fg`,
không hardcode `#059669`.

### 3.4 Preset ngưỡng
Đóng: **C5**, **C6**, **C7**.
```js
export const THRESHOLD_PRESETS = {
  strict:  { label: 'Chặt',  warningThresholdPct: 10, criticalThresholdPct: 25 },
  normal:  { label: 'Thường', warningThresholdPct: 20, criticalThresholdPct: 50 }, // default
  loose:   { label: 'Lỏng',  warningThresholdPct: 30, criticalThresholdPct: 75 }
};
// Các tham số còn lại chốt cứng, không phơi ra UI thường:
export const BASELINE_CONFIG = {
  baselineWindowDays: 28, baselineMethod: 'mean', minDataPoints: 5,
  lowSampleThreshold: 5, anomalyDropPct: 40
};
```
- UI thường: 3 nút segmented "Chặt / Thường / Lỏng".
- Panel nâng cao (chỉ `currentUser.isDevAdmin`): mở được cả 8 tham số. Ô nhập số dùng
  **local string state, commit khi blur/Enter** — không `Math.max()` ngay trên từng ký tự
  (đóng C6, đang không gõ được số 2 chữ số).
- Warning ≥ Critical: **hiện lỗi inline + disable nút Áp dụng**, không tự sửa con số bên cạnh
  (đóng C7).

### 3.5 Test
Đóng: **D9**.

File mới `src/utils/leadtimeCalc.test.mjs` + `src/utils/laneTaxonomy.test.mjs`.
`package.json`: `"test": "node --test src/utils/*.test.mjs"`.

Case bắt buộc (map từ plan v1 mục 7 + audit):
1. `weightedAvgByStage`: lane `mau=2192, mid=3.3h` không bị lane `mau=1` kéo lệch.
2. NULL bị loại khỏi **cả tử và mẫu** riêng từng chặng.
3. `getLanesFromRows` trả đủ 5 lane từ data có `"Intra city"`, `"INTRA CITY"`, `"Cross metro *"`.
4. `resolveBaseline` chế độ khoảng ngày: các ngày trong kỳ đang xem **không** nằm trong baseline.
5. `resolveBaseline` fallback: tuyến có 3 ngày data (< minDataPoints 5) → trả `level: 'lane'`.
6. `classifyDeviation`: `+9%` → `level: 'normal'`, `direction: 'up'` (KHÔNG xanh).
7. `classifyDeviation`: `-55%` → `level: 'critical'`, `direction: 'down'`.
8. `isUnresolvedLaneRow`: chỉ đúng khi cả 3 cột from/to/lane rỗng; lane rỗng nhưng có from/to
   thì **không** vào bucket này (hiện đang rơi vào nhóm "Khác" và biến mất khỏi chart).
9. E2E: `avg_lt_e2e_hour` thiếu / `undefined` → trả `null`, không ra chuỗi `"undefinedh"` (B8).

---

## 4. Phase 2 — Dựng lại UI theo tầng thông tin

Đóng: **C3**, **C4**, **A4**, **A2b**, **B4**, **B6**, **B7**, **C1**, **C2**, **C9**, **C12**.

Cấu trúc file:
```
src/components/ReportLeadtime/
  index.jsx                  ← orchestrator: filter state + useMemo index + layout
  LeadtimeFilterBar.jsx
  LeadtimeVerdict.jsx        ← tầng 1
  LeadtimeStageCards.jsx     ← tầng 1
  LeadtimeTrendChart.jsx     ← tầng 2
  LeadtimeLaneChart.jsx      ← tầng 3
  LeadtimeTopLanes.jsx       ← tầng 4
  LeadtimeDetailTable.jsx    ← tầng 5
  LeadtimeDataQuality.jsx    ← tầng 6
```

### 4.1 Tầng 1 — Câu trả lời (above the fold)

**a) Dòng kết luận** (`LeadtimeVerdict`) — 1 câu, sinh tự động:
> Nút thắt hôm nay: **Middle mile** ở **Cross region** — 27,4h (+18% vs baseline 28 ngày).
> **6 lane** vượt ngưỡng cảnh báo. Sản lượng ảnh hưởng: **12.480 đơn**.

Chọn nút thắt theo **impact**, không theo % lệch đơn thuần:
`impact = SUM(mau) × (current − baseline)` — giờ trễ cộng dồn, đơn vị "giờ × đơn". Lane
`mau=1` lệch +200% không được leo lên đầu (đúng tinh thần weighted average).

**b) 5 KPI card** (`LeadtimeStageCards`): E2E · Pre-pickup · First mile · Middle mile · Last mile.
Mỗi card: giá trị weighted (h) · delta vs kỳ trước · sparkline 14 ngày · sản lượng mẫu.

Dùng lại class `.kpi-card`, `.kpi-card-title/main/pct/diff/chart/stats` và
`.kpi-cards-container` sẵn có. `SparklineChart` + `AnimatedNumber` hiện là hàm local trong
`Report1MienVungHub.jsx` → **tách ra** `src/components/ui/SparklineChart.jsx` và
`src/components/ui/AnimatedNumber.jsx`, Report1 import lại (không copy-paste).

Card E2E ghi rõ nguồn số để hết nhập nhằng B4:
> E2E = `avg_lt_e2e_hour` weighted theo sản lượng. Tổng 4 chặng = 20,4h (lệch do NULL từng chặng).

### 4.2 Tầng 2 — Xu hướng (`LeadtimeTrendChart`) — CHART ĐANG THIẾU HẲN
- Line chart (recharts `LineChart`), trục X = `report_date`, 4 đường = 4 chặng, tuỳ chọn
  thêm đường E2E.
- Toggle cửa sổ: 14 / 28 / 90 ngày.
- Vẽ **band baseline** (`ReferenceArea`) cho chặng đang chọn highlight → nhìn ra ngay hôm nào
  vượt ngưỡng, thay vì phải đọc % trong tooltip.
- Toàn bộ máy móc rolling baseline 28 ngày đã tính sẵn ở Phase 1, chart này chỉ là hiển thị.

### 4.3 Tầng 3 — Cấu trúc theo lane (`LeadtimeLaneChart`)
- Stacked bar, trục X = **lane từ `getLanesFromRows`** (động, đủ 5 nhóm), stack = 4 chặng.
- `clientFilter === 'ALL'` → **2 chart cạnh nhau** (small multiples), mỗi chart 1 client, có
  tiêu đề rõ ràng; **không** interleave 2 stack trong cùng nhóm (đóng C1).
- Trục Y `domain={[0, 'dataMax']}` + `allowDecimals={false}` — bỏ khoảng trống 25% (C3).
- `<Legend>` của recharts cho 4 chặng, bỏ legend tự dựng đang ghi sai tên client.
- Tên client lấy từ 1 chỗ duy nhất `src/utils/clientLabels.js`:
  `SPB = 'Shopee Bulky'`, `SPE = 'Shopee Express'` (đóng **C2** — đang ghi
  "Shopee Express Backlog").
- Chặng NULL toàn nhóm: dùng `<Bar shape={...}>` fill `url(#nullHatchPattern)` — pattern đã
  khai báo sẵn nhưng chưa dùng ở đâu (đóng **B7**).
- Chiều cao container: `min(420px, 45vh)`, có `overflow-x: auto` khi < 640px (đóng C10).
- Tooltip viết lại: **chỉ hiện chặng đang hover** + giá trị + % đóng góp + baseline (số thật)
  + cấp baseline + `SUM(mau)`. Không in cả 2 client × 4 chặng như bản cũ (đóng D8).

### 4.4 Tầng 4 — Top lane cần xử lý (`LeadtimeTopLanes`) — MỚI
Câu hỏi vận hành hay hỏi nhất, hiện chưa có chỗ nào trả lời.
- Horizontal bar / bảng gọn, **top 10** sort theo `impact` (4.1a), không sort theo `e2e` desc
  như bản cũ (e2e cao chưa chắc là bất thường — Cross region luôn cao).
- Mỗi dòng: `from → to` · lane · client · chặng gây lệch · giờ hiện tại vs baseline · sản
  lượng · badge mức độ.
- Bấm 1 dòng → set drill-down + scroll xuống bảng chi tiết.

### 4.5 Tầng 5 — Bảng chi tiết (`LeadtimeDetailTable`)
Chữa **A2b**, **A4**, **C9**:
- **Nhóm chính = lane** (`externallane_new`), mỗi lane là 1 section **collapse được**, mặc
  định chỉ mở lane đang có cảnh báo.
- Bỏ cột "Nhóm Lane" (đang lặp lại y nguyên hàng group header).
- **Thêm cột "Ngày"**, chỉ render ở chế độ khoảng ngày.
- Chế độ khoảng ngày mặc định **gộp theo tuyến** (weighted theo `mau` toàn kỳ) — 1 dòng /
  tuyến / client thay vì 7 dòng. Có checkbox "Hiện từng ngày" cho ai cần dòng thô.
- Giới hạn **50 dòng/lane** + nút "Hiện tất cả (N)" — không đổ 763 dòng ra DOM.
- Mỗi ô chặng: giờ + % lệch + tooltip ghi `baseline = X,Xh (cấp tuyến / cấp nhóm, N ngày)`
  (đóng B3).
- Nhãn "mẫu ít" giữ nguyên; thêm nhãn "baseline nhóm" khi fallback.
- Sửa canh lề: set `textAlign` cho **cả `<td>`** không chỉ `<th>`; cột text (`from → to`,
  lane) dùng `font-family: var(--font-sans)` thay vì mono (đóng C8). Cách đúng: thêm class
  `.mtx-table td.cell-text { text-align: left; font-family: var(--font-sans); }` vào
  `index.css`, không set inline.
- Mobile: đóng băng cột tuyến như `Report1` (class có sẵn ở `index.css:2205`).
- Đổi tên cột `MAU` → **`Sản lượng (mẫu)`**, header CSV → `sample_size` (đóng **B6**).
- Dùng 1 loại mũi tên duy nhất `→` ở mọi nơi (đóng C11 — đang lẫn `→` và `➔`).

### 4.6 Tầng 6 — Chất lượng dữ liệu (`LeadtimeDataQuality`) — MỚI
Gom 2 thứ hiện đang rời rạc và khó hiểu:
- Bucket "không xác định lane" (cả 3 cột from/to/lane NULL) — giữ như hiện tại.
- **Bảng đếm NULL theo từng chặng × lane** — trả lời câu hỏi treo ở plan v1 mục 9: các lane
  intra-city NULL `firstmile`/`middlemile` là data lỗi hay hành vi thật. Có bảng này thì thấy
  ngay pattern, không phải đi soi từng dòng.
- Cả section này collapse, mặc định đóng.

### 4.7 Filter bar (`LeadtimeFilterBar`)
- **Ngày**: preset nhanh `D-1` · `7 ngày` · `28 ngày` · `Tuỳ chọn` — thay vì dropdown
  "Một ngày / Khoảng ngày" rồi tự gõ ngày.
- `min`/`max` của input date = biên `allDates`. Ngày không có data → **giữ nguyên lựa chọn**
  + hiện dòng "Ngày này chưa có dữ liệu", **không tự nhảy về ngày mới nhất** (đóng **A3**).
- Bỏ mặc định hardcode `'2026-08-19'` (đóng D6).
- `startDate` tính theo **ngày lịch** (`endDate − 6 ngày`), không lấy `allDates[length-7]`
  (đóng D5).
- Bỏ toggle SPB/SPE trong tab — dùng `clientFilter` từ header (B9).
- Drill-down đổi thành **2 cấp**: chọn lane (5 mục) → mới hiện dropdown tuyến thuộc lane đó.
  Bỏ dropdown phẳng hàng trăm cặp tỉnh (A2b).
- `App.jsx` truyền `clientFilter` xuống tab (hiện **không truyền**).
- `Header.jsx`: nhận `activeTab`, ẩn `Vùng` + `Loại Hub` khi `activeTab === 'report3'`.

### 4.8 Empty state
Đóng: **C12**.
3 trạng thái riêng, không để trục trắng:
- Chưa có data nào → "Chưa đồng bộ dữ liệu leadtime" + nút Tải lại.
- Có data nhưng ngày đang chọn trống → "Ngày dd/mm chưa có dữ liệu" + nút "Về ngày gần nhất".
- Drill-down không khớp → "Tuyến này không có dữ liệu trong kỳ" + nút "Bỏ lọc".

---

## 5. Phase 3 — Design system

Đóng: **C11**.

| Việc | Chi tiết |
|---|---|
| Bỏ inline style | Từ 133 → mục tiêu **< 20** (chỉ giữ cái thật sự động: `width` theo %, `--card-index`). Tạo section `/* ===== Tab Leadtime ===== */` trong `src/index.css` |
| Bỏ hex hardcode | Từ 25 → **0**. Dùng token: `--ghn-orange`, `--action-primary`, `--status-*-fg/bg`, `--text-secondary` |
| Bảng màu 4 chặng | Định nghĩa **token mới** trong `src/styles/tokens.css`: `--stage-prepickup/-firstmile/-middlemile/-lastmile`, có bản `body.dark-mode`. Phái sinh từ brand GHN (cam→xanh), không dùng Tailwind mặc định |
| Bỏ emoji heading | 11 → **0**. Dùng icon `lucide-react` như các tab khác |
| Chuẩn hoá chữ | Sentence case ("Bảng chi tiết từng tuyến"), thuần Việt: "Lane drill-down" → "Xem sâu theo lane"; "Grouped by / Stacked by" → bỏ; "Client" → "Khách hàng" |
| Cỡ chữ / radius | Chỉ dùng thang có sẵn + `--radius-control` / `--radius-surface`. Bỏ 6 giá trị radius rời rạc |
| Feedback copy ảnh | Bỏ `alert()`, dùng state "đã copy" inline giống `Report5LaneCa1` |
| Export ảnh dark mode | `backgroundColor` đọc từ computed style của body, không hardcode `'#ffffff'` (đang xuất nền trắng chữ sáng) |
| Viền chặng highlight | `stroke` dùng `var(--text-main)`, không `#1e293b` cố định (dark mode đang tàng hình) |
| Nút thoát fullscreen | Bỏ nút tròn đỏ riêng (z-index 9999) — header đã có `Minimize2`; giữ phím Esc |
| Dark mode | Kiểm từng section bằng `body.dark-mode`, đặc biệt badge `--status-*` và tooltip |

---

## 6. Phase 4 — Dọn dẹp

| Việc | Đóng |
|---|---|
| Xoá `Report2TopSeller.jsx`, `Report3CaHub.jsx`, `Report4Focus1Vung.jsx` (~1.500 dòng code chết, không import ở đâu) | D2 |
| Đổi tab id `report6` → `report3`, component → `ReportLeadtime`; sửa `Sidebar.jsx`, `App.jsx`, mobile bottom nav | D1 |
| `React.lazy(() => import('./components/ReportLeadtime'))` + `<Suspense fallback={<LoadingScreen/>}>` → recharts ra khỏi chunk chính | D3 |
| Bỏ pattern `Number(config.x) \|\| default` trong `leadtimeCalc` (giá trị `0` bị âm thầm thay bằng mặc định) | D7 |
| Xoá `Report6Leadtime.jsx` + `leadtimeDataset.js` chuyển thành fixture chỉ dùng cho test, không còn là default state của app | A1 |

**Ngân sách bundle:** hiện 960kB / 1 chunk. Mục tiêu: chunk chính **< 600kB**, chunk leadtime
tách riêng.

---

## 7. Thứ tự thực hiện

```
Phase 0  Nối data thật ─────────────── chặn tất cả (cần GID + SQL từ Vinh)
   │
Phase 1  laneTaxonomy → leadtimeCalc v2 → test → bench   (không phụ thuộc UI, làm song song được)
   │
Phase 2  4.7 filter → 4.1 tầng 1 → 4.2 trend → 4.3 lane chart → 4.4 top lanes
         → 4.5 bảng → 4.6 data quality → 4.8 empty state
   │
Phase 3  Design system (làm cuốn theo từng component ở Phase 2, không để dồn cuối)
   │
Phase 4  Dọn dẹp + code-split + xoá file cũ
```

Gate mỗi phase: `npm run test` && `npx oxlint src/` && `npm run build` && chụp màn hình
1600px + 390px, light + dark.

---

## 8. Acceptance criteria — đối chiếu audit

| ID | Tiêu chí nghiệm thu |
|---|---|
| A1 | `kas_leadtime_data` có dữ liệu; tab hiện badge nguồn + thời điểm sync; ở chế độ mock có banner cảnh báo |
| A2 | Thêm dòng lane `"CROSS METRO"` → hiện đúng nhóm trên chart + bảng, không rơi vào "Khác" |
| A2b | Trục chính của chart và nhóm của bảng đều là `externallane_new`; dropdown tuyến chỉ hiện sau khi chọn lane |
| A3 | Gõ ngày không có data → lựa chọn được giữ + hiện thông báo; không tự nhảy |
| A4 | Khoảng 7 ngày, data thật: bảng ≤ 50 dòng/lane, có cột Ngày, trang < 6.000px |
| A5 | Bench: < 30ms (1 ngày) / < 80ms (7 ngày) |
| B1 | Test: ngày trong kỳ đang xem không xuất hiện trong tập baseline |
| B2 | Drill-down 1 tuyến → tooltip ghi "baseline cấp tuyến"; nếu fallback thì ghi "cấp nhóm" |
| B3 | Mọi % lệch đều kèm giá trị baseline + cấp + số ngày |
| B4 | Card E2E ghi rõ E2E ≠ tổng 4 chặng và lý do |
| B5 | `+9%` không tô xanh; `−55%` gắn cờ "nghi lỗi data" |
| B6 | Không còn chữ "MAU" trong UI và trong header CSV |
| B7 | Lane `Đà Nẵng → Đà Nẵng` hiện segment gạch chéo, không phải cột thấp |
| B8 | CSV thiếu cột E2E → hiện `–`, không `undefinedh` |
| B9 | Đổi client ở header → tab 3 đổi theo; `Vùng`/`Loại Hub` ẩn khi ở tab 3 |
| C1 | `clientFilter = ALL` → 2 chart riêng có tiêu đề; không còn legend "Cột 1 / Cột 2" |
| C2 | SPB = "Shopee Bulky" ở mọi nơi |
| C3 | Có trend chart theo ngày + top-N lane + 5 KPI card; trục Y không còn 25% trống |
| C4 | Trong 1 màn hình đầu trả lời được: bao nhiêu giờ / tăng-giảm / nút thắt ở đâu |
| C5-C7 | 3 preset ngưỡng; panel nâng cao chỉ dev admin; nhập được số 2 chữ số; sai ngưỡng thì báo lỗi chứ không tự sửa |
| C8 | Header và nội dung bảng canh cùng lề; cột text không dùng font mono |
| C9 | Không còn cột "Nhóm Lane" trùng group header |
| C10 | 390px: chart scroll ngang được, bảng có cột đóng băng, không tràn layout |
| C11 | inline style < 20, hex hardcode = 0, emoji = 0, 1 loại mũi tên |
| C12 | 3 empty state riêng biệt |
| D1-D7 | Đã dọn theo bảng mục 6; chunk chính < 600kB |
| D9 | `npm run test` xanh với 9 nhóm case ở 3.5 |

---

## 9. Cần Vinh xác nhận / cung cấp

1. **GID của tab leadtime** trong Google Sheet nguồn → để bật `TAB_GIDS.leadtime` (2.2).
   Không có cái này thì Phase 0 đứng, và tab tiếp tục chạy số mẫu.
2. **File `leadtime_chang_deli.sql`** thật (hiện chỉ có CSV output) → để đưa vào
   `shopee/` và review cách tính từng mốc (2.3).
3. **Case NULL `firstmile`/`middlemile`** ở các lane intra-city: lỗi data nguồn cần fix ở SQL,
   hay hành vi thật? Quyết định UI vẽ gạch chéo (hành vi thật) hay báo lỗi data (2.3, 4.6).
4. **Ngưỡng nghiệp vụ**: preset "Thường" đang lấy 20%/50% từ plan v1. Có target leadtime chính
   thức theo lane không (VD Cross region ≤ 48h)? Nếu có thì nên so với **target** chứ không chỉ
   so với baseline lịch sử — baseline chỉ nói "khác thường", target mới nói "đạt/không đạt".
5. **Ai là người dùng chính của tab này** — điều hành hub, hay KAS report? Ảnh hưởng tới việc
   tầng 1 nên là "nút thắt cần xử lý hôm nay" (điều hành) hay "leadtime trung bình kỳ" (report).
   Plan hiện đang thiết kế theo hướng điều hành.
