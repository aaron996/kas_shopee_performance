# Plan: Tab "Leadtime từng chặng" (SPE/SPB)

> Trạng thái: PLAN — chưa code. Viết theo rule tính toán/visualize leadtime do Vinh
> cung cấp + đối chiếu với file CSV mẫu output thực tế của `leadtime_chang_deli.sql`
> (`sqllab_untitled_query_6_20260820T082442__Sheet1_1.csv`, 109 dòng, ngày
> 2026-08-18 và 2026-08-19).

## 0. Quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Nguồn dữ liệu | Bảng Supabase mới `kas_leadtime_data`, sync theo pattern `kas_ca1_data` (Apps Script → Supabase, atomic delete+insert) |
| Chart library | Thêm `recharts` (repo hiện chưa có chart lib nào — Report5 tự vẽ bảng HTML thuần) |

## 1. Đối chiếu schema với data mẫu thực tế

Cột trong CSV mẫu khớp đúng rule mục 1:

```
report_date, fromprovince_new, toprovince_new, externallane_new, client_name,
mau, avg_lt_prepickup_hour, avg_lt_firstmile_hour, avg_lt_middlemile_hour,
avg_lt_lastmile_hour, avg_lt_e2e_hour
```

Quan sát thêm từ data mẫu (ảnh hưởng cách code xử lý):

- Tên tỉnh có dấu tiếng Việt đầy đủ (`Bắc Ninh`, `Hồ Chí Minh`, `Đà Nẵng`...) —
  không phải mã tỉnh viết tắt như Pick/Deli (`HNO`, `HCM`...). Component leadtime
  **không dùng chung `MIEN_REGIONS`/`getHubType`** của dataset cũ — cần build danh
  sách tỉnh/lane riêng từ chính `leadtimeRows`.
- `mau` dao động cực lớn: từ `1` (VD `Bắc Ninh→Bắc Ninh` SPB mau=1) đến `2192`
  (`Hồ Chí Minh→Hồ Chí Minh` SPB) — xác nhận đúng lý do rule bắt buộc weighted
  average theo `mau`, không dùng trung bình đơn giản.
- NULL rải rác đúng như rule mô tả, ví dụ trong sample:
  - `2026-08-19, Hà Nội, Hưng Yên, Intra region, SPB, mau=5`: `avg_lt_prepickup_hour`
    và `avg_lt_firstmile_hour` đều NULL, nhưng `middlemile/lastmile/e2e` có giá trị.
  - `2026-08-19, Tây Ninh, Hồ Chí Minh, Intra region, SPE, mau=1`: NULL ở
    `firstmile` và `middlemile`.
  - `2026-08-18, Đà Nẵng, Đà Nẵng, Intra city, SPB, mau=40`: NULL ở `firstmile` và
    `middlemile` (toàn bộ dòng cross-day cùng lane cũng NULL 2 chặng này — cần
    kiểm tra thực tế xem đây là lỗi thiếu mốc thời gian ở nguồn hay pattern thật).
  - Dòng `2026-08-18,,,,SPE,mau=1,...` — đúng bucket "Không xác định lane" (3 cột
    `fromprovince_new/toprovince_new/externallane_new` đều NULL) mà rule mục 4 yêu
    cầu tách riêng.
- `e2e` không bằng tổng 4 chặng (VD `Bắc Ninh→Bắc Ninh` SPB ngày 19/8:
  `10.2+0.3+6.22+0.82 = 17.54` vs `e2e=17.55`, lệch nhỏ do rounding — nhưng có case
  lệch NULL rõ hơn ở dòng có NULL từng chặng) → xác nhận đúng lưu ý "không giả định
  e2e = sum 4 chặng theo dòng", chỉ so sánh ở mức aggregate.
- Cả 3 loại `externallane_new` (`Intra city`, `Intra region`, `Cross region`) đều
  xuất hiện, cả SPE và SPB.

## 2. Việc cần làm ở phía data pipeline (ngoài code)

- File SQL gốc: cần copy/đặt `leadtime_chang_deli.sql` vào repo tại
  `shopee/leadtime_chang_deli.sql`. **Chưa có bản SQL thật trong tay** (chỉ có
  CSV output) — cần Vinh gửi thêm hoặc xác nhận để mình viết lại SQL dựa trên
  cấu trúc `Dtm_KA_V3_CreatedDate LEFT JOIN Dtm_KA_Shopee` mô tả ở rule mục 1,
  rồi review lại logic tính từng mốc leadtime.
- Apps Script (Google Sheet → Supabase): thêm 1 tab/segment mới trỏ tới output
  của SQL trên, đẩy vào bảng `kas_leadtime_data` — cần biết Apps Script hiện tại
  đang chạy ở đâu (không có trong repo, chỉ có `docs/google-sheet-supabase-sync.md`
  mô tả) để bổ sung đúng entry mới.

## 3. Database layer (Supabase)

**Migration mới**: `supabase/migrations/<date>_create_kas_leadtime_data.sql`

```sql
create table if not exists kas_leadtime_data (
  id bigint generated always as identity primary key,
  report_date date not null,
  fromprovince_new text,
  toprovince_new text,
  externallane_new text,
  client_name text not null,
  mau integer,
  avg_lt_prepickup_hour numeric,
  avg_lt_firstmile_hour numeric,
  avg_lt_middlemile_hour numeric,
  avg_lt_lastmile_hour numeric,
  avg_lt_e2e_hour numeric,
  synced_at timestamptz not null default now()
);

alter table kas_leadtime_data enable row level security;

create policy "authenticated can select kas_leadtime_data"
  on kas_leadtime_data for select
  to authenticated
  using (true);

create or replace function sync_kas_leadtime_data(rows jsonb)
returns void
language plpgsql
security definer
as $$
begin
  delete from kas_leadtime_data;
  insert into kas_leadtime_data (
    report_date, fromprovince_new, toprovince_new, externallane_new,
    client_name, mau, avg_lt_prepickup_hour, avg_lt_firstmile_hour,
    avg_lt_middlemile_hour, avg_lt_lastmile_hour, avg_lt_e2e_hour, synced_at
  )
  select
    (r->>'report_date')::date,
    r->>'fromprovince_new',
    r->>'toprovince_new',
    r->>'externallane_new',
    r->>'client_name',
    (r->>'mau')::integer,
    (r->>'avg_lt_prepickup_hour')::numeric,
    (r->>'avg_lt_firstmile_hour')::numeric,
    (r->>'avg_lt_middlemile_hour')::numeric,
    (r->>'avg_lt_lastmile_hour')::numeric,
    (r->>'avg_lt_e2e_hour')::numeric,
    now()
  from jsonb_array_elements(rows) as r;
end;
$$;
```
(Điều chỉnh chi tiết RPC theo đúng cách RPC hiện có của `kas_ca1_data` — cần đọc
Apps Script/RPC hiện tại để khớp signature, đây chỉ là bản nháp cấu trúc tương tự.)

**`src/utils/supabaseSheetSync.js`**: thêm `fetchAllRows('kas_leadtime_data')`
vào `Promise.all`, trả thêm `leadtimeData` trong kết quả trả về của
`fetchSupabaseSheetSync()` (optional — không throw nếu bảng rỗng, giống cách
`ca1Data` đang được xử lý là `ca1Data.length ? ca1Data : null`).

**`docs/google-sheet-supabase-sync.md`**: bổ sung mục hướng dẫn thêm tab
leadtime vào Apps Script.

## 4. Data & calc layer (frontend)

**`src/data/leadtimeDataset.js`** (mock data cho dev/demo khi chưa có Supabase
data thật):
- `createDefaultLeadtimeDataset()` — build từ chính pattern của CSV mẫu (số
  tỉnh, tên có dấu, NULL rải rác, 1 dòng bucket "Không xác định lane", biên độ
  `mau` rộng) để UI test đúng mọi edge case ngay từ đầu.

**`src/utils/leadtimeCalc.js`** — toàn bộ hàm nhận `thresholdConfig` làm tham số
đầu vào, không đọc hằng số cố định trong thân hàm (đúng yêu cầu bắt buộc rule
2.4):

```js
export const DEFAULT_THRESHOLD_CONFIG = {
  baselineWindowDays: 28,
  baselineMethod: 'mean',       // 'mean' | 'median'
  minDataPoints: 5,
  warningThresholdPct: 20,
  criticalThresholdPct: 50,
  lowSampleThreshold: 5,
  highlightedStage: 'middlemile',
};

export const STAGE_KEYS = ['prepickup', 'firstmile', 'middlemile', 'lastmile'];

// Bucket "Không xác định lane": cả 3 cột from/to/lane đều NULL
export function isUnresolvedLaneRow(row) { ... }

// Rolling baseline (mean hoặc median) theo (from, to, lane, client) trong
// baselineWindowDays ngày trước report_date (không gồm chính ngày đang xét).
// Bỏ NULL. Nếu số report_date có data < minDataPoints -> fallback baseline lên
// cấp (externallane_new, client_name) gộp mọi lane cùng loại.
export function computeBaseline(allRows, { from, to, lane, client, stageKey, asOfDate }, config) { ... }

// pct_deviation = (current - baseline) / baseline * 100
// trả { pctDeviation, level: 'normal' | 'warning' | 'critical' }
export function classifyDeviation(currentValue, baseline, config) { ... }

// weighted average theo mau cho 1 nhóm lane (loại NULL khỏi cả tử và mẫu
// riêng cho từng chặng)
export function weightedAvgByStage(rows, stageKey) { ... }

// SUM(4 chặng weighted) dùng làm chiều cao cột stacked (KHÔNG dùng avg_lt_e2e_hour)
export function stackedHeightByLaneGroup(rows) { ... }

// Gom nhóm theo mau: mau < lowSampleThreshold -> gắn nhãn "mẫu ít"
export function isLowSample(mau, config) { ... }
```

## 5. Component chính

**`src/components/Report6Leadtime.jsx`**

Cấu trúc UI theo đúng rule mục 3:

1. **Filter bar** (giống pattern `Report5LaneCa1`):
   - Date range picker (mặc định = `report_date` gần nhất có data, VD 2026-08-19
     theo sample).
   - Multi-select `client_name` (mặc định chọn cả SPE + SPB).
   - Dropdown optional: chọn 1 lane cụ thể (`fromprovince_new → toprovince_new`)
     để drill-down thay vì gộp theo `externallane_new`.

2. **Panel cấu hình threshold** (collapsible, đặt trên/cạnh chart) — render đúng
   7 control bảng mục 2.4:

   | Biến | Control |
   |---|---|
   | `baselineWindowDays` | Slider 7–90, mặc định 28 |
   | `baselineMethod` | Radio `mean` / `median` |
   | `minDataPoints` | Number input 2–20, mặc định 5 |
   | `warningThresholdPct` | Slider %, 5–100, mặc định 20 |
   | `criticalThresholdPct` | Slider %, luôn > `warningThresholdPct` hiện tại (validate + disable nếu nhập ngược), mặc định 50 |
   | `lowSampleThreshold` | Number input 1–50, mặc định 5 |
   | `highlightedStage` | Dropdown 4 chặng, mặc định `middlemile` |

   - Toàn bộ 7 biến gom trong 1 state `thresholdConfig` ở `Report6Leadtime`
     (component cha), truyền props xuống cả `leadtimeCalc.js` (qua hook nội bộ)
     và panel UI — không hardcode 2 nơi khác nhau.
   - Nút "Reset về mặc định" → set lại `DEFAULT_THRESHOLD_CONFIG`.
   - Đổi giá trị trên UI → re-render chart/bảng ngay (tính lại classification
     bằng `useMemo` phụ thuộc `thresholdConfig`, không cần fetch lại data).

3. **Chart chính** — grouped + stacked bar bằng `recharts`:
   - Trục X: 3 nhóm `Intra city` / `Intra region` / `Cross region`.
   - Mỗi nhóm X: 2 bar con SPE/SPB đặt cạnh nhau (`BarCategoryGap`/2 `<Bar>` set
     riêng `stackId` theo từng client để không lẫn stack giữa 2 client).
   - Mỗi bar: 4 `<Bar>` con theo `stackId={client}` xếp chồng đúng thứ tự
     prepickup (đáy) → firstmile → middlemile → lastmile (đỉnh).
   - Giá trị mỗi segment = `weightedAvgByStage` theo `mau` trên toàn bộ lane
     thuộc nhóm X trong khoảng ngày đang xem (KHÔNG trung bình đơn giản).
   - Chiều cao cột = `stackedHeightByLaneGroup` (SUM 4 chặng weighted), không
     dùng `avg_lt_e2e_hour`.
   - Segment NULL toàn bộ trong nhóm → height 0, custom SVG `<pattern>` gạch
     chéo thay vì fill đặc (custom `shape` prop trên `<Bar>`).
   - Chặng `highlightedStage` (mặc định middlemile) có style nổi bật hơn (viền
     dày hơn/độ bão hòa màu cao hơn) — đổi theo `thresholdConfig.highlightedStage`.
   - Custom `<Tooltip content={CustomLeadtimeTooltip}>` hiển thị đúng mục 3.2:
     tên chặng + giờ trung bình, % đóng góp vào tổng nhóm, `SUM(mau)`, % lệch so
     baseline (tính bằng `classifyDeviation`) kèm màu xanh/vàng/đỏ — tính lại mỗi
     render theo `thresholdConfig` hiện tại, không cache cứng.

4. **Bảng chi tiết drill-down** (mục 3.4): liệt kê từng lane thuộc
   `externallane_new` đang chọn, sort giảm dần theo `avg_lt_e2e_hour`, cột: Lane
   (from → to), client, `mau`, 4 chặng + e2e, cờ cảnh báo (badge theo
   `classifyDeviation`), nhãn "mẫu ít" nếu `mau < lowSampleThreshold`.

5. **Bucket "Không xác định lane"**: section riêng cuối bảng (dùng
   `isUnresolvedLaneRow`), không gộp vào breakdown theo `externallane_new` nào.

6. Export ảnh chart/bảng bằng `html-to-image`, đồng bộ UX copy/tải PNG như
   `Report5LaneCa1`.

## 6. Gắn tab vào layout

- `src/components/Sidebar.jsx`: thêm
  `{ id: 'report6', label: '3. Leadtime từng chặng', icon: Clock }` vào `tabs`.
- `src/App.jsx`:
  - `const [leadtimeRows, setLeadtimeRows] = useState(() => createDefaultLeadtimeDataset())`.
  - Nối vào `handleResetDefaultData`, nhánh Supabase trong `handleSyncLiveSheet`.
  - Render `activeTab === 'report6' && <Report6Leadtime leadtimeRows={leadtimeRows} clientFilter={clientFilter} density={density} isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen} />`.
  - **Không filter** `leadtimeRows` theo `selectedRegions`/`selectedHubTypes` như
    Pick/Deli (grain khác — province-pair, không phải hub/vùng theo
    `MIEN_REGIONS`); filter riêng bên trong component (date range + client),
    giống cách `Report5LaneCa1` tự quản filter.
  - Mobile bottom nav: thêm nút thứ 3 (`Clock`/`Timer`).
- `src/components/DataSourceManagerModal.jsx`: thêm khối upload CSV thủ công
  cho leadtime (dùng `Papa.parse` sẵn có) + status hiển thị số dòng đã sync.

## 7. Test / validate case (map trực tiếp theo data mẫu)

- Bucket "Không xác định lane": dòng `2026-08-18,,,,SPE,1,...` phải nằm ở section
  riêng cuối bảng, không tính vào breakdown `externallane_new` nào.
- Segment NULL toàn bộ: lane `Đà Nẵng → Đà Nẵng` (Intra city, SPB, mau=40) có
  `firstmile`/`middlemile` NULL — verify segment hiện pattern gạch chéo, không
  phải màu đặc "= 0".
- Mẫu ít: lane `Bắc Ninh → Bắc Ninh` SPB ngày 19/8 có `mau=1` → hiện nhãn "mẫu
  ít" theo `lowSampleThreshold` mặc định 5.
- Weighted average đúng: so `Hồ Chí Minh → Hồ Chí Minh` (SPB, mau=2192,
  middlemile=3.3h) không được kéo lệch bởi các lane `mau=1` khác trong cùng
  nhóm `Intra city` khi tính giá trị hiển thị cho cột `Intra city × SPB`.
- Baseline fallback: dựng thêm mock case 1 lane chỉ có < 5 report_date trong 28
  ngày gần nhất → verify fallback lên baseline cấp `externallane_new × client_name`.
- `criticalThresholdPct` nhập ≤ `warningThresholdPct` → UI phải disable/báo lỗi.
- Đổi `thresholdConfig` trên UI → tooltip/màu badge đổi ngay không cần
  reload/fetch lại data.

## 8. Thứ tự thực hiện đề xuất

1. `npm install recharts`.
2. `src/data/leadtimeDataset.js` (mock data bám sample thật) — dựng UI trước với
   mock, chưa cần Supabase.
3. `src/utils/leadtimeCalc.js` (baseline/threshold/weighted-avg/stacked-height).
4. `src/components/Report6Leadtime.jsx` (filter → panel config → chart → bảng
   drill-down → bucket riêng → export ảnh).
5. Gắn tab: `Sidebar.jsx`, `App.jsx` (state + render + mobile nav).
6. Supabase: migration `kas_leadtime_data` + RPC sync + sửa
   `supabaseSheetSync.js` + `DataSourceManagerModal.jsx`.
7. Cập nhật `docs/google-sheet-supabase-sync.md`.
8. `npx oxlint` + `npm run build` + test tay bằng mock/sample data, đối chiếu
   từng edge case ở mục 7.

## 9. Việc còn cần Vinh xác nhận/cung cấp

- File SQL thật `leadtime_chang_deli.sql` (hiện chỉ có CSV output, chưa có SQL
  gốc) — cần để đặt vào `shopee/leadtime_chang_deli.sql` và hiểu đúng cách tính
  từng mốc leadtime trước khi viết Apps Script sync.
- Xác nhận Apps Script hiện tại (không có trong repo) đang quản lý ở đâu để
  biết cách thêm tab/segment mới cho leadtime.
- Xác nhận case NULL `firstmile`/`middlemile` toàn bộ ở 1 số lane (VD
  `Đà Nẵng → Đà Nẵng`, `Đồng Nai → Đồng Nai` trong sample) có phải lỗi dữ liệu
  nguồn cần fix ở SQL, hay là hành vi đã biết cần UI xử lý bằng pattern gạch
  chéo như rule mô tả.
