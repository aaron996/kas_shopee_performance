# Plan build lại tab 3 "Leadtime từng chặng"

> Cập nhật 2026-08-20 (v2) — đã đối chiếu **output thật** của
> `shopee/leadtime_chang_deli.sql`: 88.480 dòng / 46 ngày (05/07→19/08) /
> 12,67M đơn / 2.305 tuyến. Quy mô này lớn hơn giả định của v1 **13,5 lần** và
> làm đổi kiến trúc tầng dữ liệu, nên phần Phase 0.5 và 3.2 đã viết lại.
>
> Đầu vào: `docs/leadtime-tab-audit.md` (32 vấn đề). Thay thế
> `docs/leadtime-tab-plan.md` (v1 — giữ làm tham chiếu rule tính toán).
> Mỗi mục ghi rõ nó đóng vấn đề nào (`A1`, `B5`, `C11`...).

---

## 0. Nguyên tắc

1. **Không nối được data thật thì không build UI tiếp.** (A1)
2. **Lane = `externallane_new`.** Cặp tỉnh `from → to` là tầng drill-down thứ 2. (A2b)
3. **Không hardcode danh mục.** Lane, client, ngày lấy động từ data. (A2)
4. **Không đẩy 88k dòng thô về browser.** Tổng hợp và tính baseline ở Postgres,
   browser chỉ trình bày. (A5 + blocker mới E3)
5. **Tầng thông tin trước, biểu đồ sau.** (C4)
6. **Mỗi con số phải kiểm chứng được**: nói rõ baseline bao nhiêu, ở cấp nào. (B3)
7. **Không có target** (đã xác nhận) → mọi so sánh là "so với chính mình"
   (baseline lịch sử), tuyệt đối không dùng chữ "đạt / không đạt" ở bất kỳ đâu.

---

## 1. Quyết định chốt

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Sửa tại chỗ hay viết mới? | **Viết mới** `src/components/ReportLeadtime/`, xoá `Report6Leadtime.jsx` khi xong | File cũ 1.235 dòng, 133 inline style, logic trộn UI |
| Nguồn client filter | **Header là nguồn duy nhất** (SPB / SPE / ALL), bỏ toggle trong tab | B9 |
| Bộ lọc Vùng / Loại Hub ở tab 3 | **Ẩn** | Không tác động gì tới grain tỉnh-tỉnh (B9) |
| So sánh SPB vs SPE | **Small multiples** — 2 chart cạnh nhau | C1 |
| Panel 7 thông số | **3 preset** (Chặt/Thường/Lỏng) + panel nâng cao chỉ `isDevAdmin` | C5-C7 |
| Nơi tính weighted avg + baseline | **Postgres** (view + RPC), không phải browser | 88k dòng = 33MB JSON, xem E3 |
| Chart library | Giữ `recharts`, **lazy-load** cả tab | D3 |
| Test framework | **`node --test`** built-in, không thêm dependency | D9 |
| Tên component / tab id | `report6` → `report3`, `Report6Leadtime` → `ReportLeadtime` | D1 |
| **Đối tượng dùng** (đã xác nhận: high + mid level) | Layout **2 lớp trên cùng một trang**: lớp 1 (tầng 1-3) đọc được không cần giải thích cho high level; lớp 2 (tầng 4-6) là công cụ đào sâu cho mid level, mặc định **collapse** | Không tách 2 tab để số không bị lệch nhau |
| **Target** (đã xác nhận: không có) | Bỏ hoàn toàn khái niệm target/KPI. Ngưỡng chỉ là "lệch bất thường so baseline" | Tránh người đọc hiểu là chỉ tiêu |

---

## 2. Đối chiếu với output thật

### 2.1 Quy mô & phân bố

| Chỉ số | Giá trị |
|---|---|
| Dòng | 88.480 (46 ngày, ~1.900-2.100 dòng/ngày) |
| Đơn | 12.670.550 (trung vị 275.208 đơn/ngày) |
| Tỉnh | 35 from × 35 to |
| Tuyến (client × from × to) | **2.305** — trong đó 1.157 cặp tỉnh riêng biệt |
| Lane | `Cross region` 55.034 · `Intra region` 30.347 · `Intra city` 2.476 · `Cross metro *` 360 · `Cross metro` 176 · **rỗng 87** |

Xác nhận **A2**: dữ liệu thật có đúng **5 lane + 1 nhóm rỗng**, không phải 3 như
code hardcode. `Cross metro` + `Cross metro *` = 536 dòng đang bị code cũ bỏ ra
khỏi chart.

Xác nhận **A2b**: **1.157 cặp tỉnh** → dropdown drill-down phẳng hiện tại sẽ có
1.157 mục. Không dùng được.

Tin tốt cho baseline (3.2): **85,5% tuyến có 28-46 ngày data** (chiếm 99,94%
sản lượng) → baseline cấp tuyến khả thi, fallback cấp lane hầu như không phải dùng.

Sản lượng cực tập trung → xác nhận hướng "Top N lane":
top 10 tuyến = 19,5% · top 50 = 53,8% · top 200 = **82,1%** sản lượng.

### 2.2 ⚠ Censoring theo `report_date` — phát hiện quan trọng nhất

`report_date = DATE(createddate)` + filter `currentstatus = 'delivered'` ⇒ cohort
theo **ngày tạo đơn**. Các ngày gần nhất chỉ chứa những đơn đã giao xong tại thời
điểm chạy query, tức **chỉ những đơn nhanh nhất**:

| report_date | dòng | đơn | % so trung vị | E2E weighted | lệch vs trung vị 7-21 ngày trước |
|---|---|---|---|---|---|
| 2026-08-13 | 1.998 | 280.726 | 102% | 58,04h | +0,6% |
| 2026-08-14 | 2.000 | 239.254 | 87% | 57,15h | −1,0% |
| 2026-08-15 | 2.051 | 304.346 | 111% | 54,41h | **−5,8%** |
| 2026-08-16 | 1.858 | 153.486 | 56% | 51,80h | **−10,8%** |
| 2026-08-17 | 1.528 | 221.655 | 81% | 39,68h | **−31,7%** |
| 2026-08-18 | 664 | 83.967 | 31% | 27,42h | **−53,0%** |
| 2026-08-19 | **17** | **2.796** | **1%** | **3,73h** | **−93,6%** |

Tab hiện tại default `dateFilter.date = latestDate` = **2026-08-19** → hiển thị
17 dòng / 2.796 đơn / E2E 3,73h. Người xem sẽ kết luận leadtime cực tốt trong khi
thực tế ~58h.

Lưu ý: **lọc theo sản lượng không đủ** để phát hiện — 15/8 có 111% sản lượng trung
vị mà E2E đã lệch −5,8%; 17/8 có 81% sản lượng mà lệch −31,7%.

**Xử lý (2 phía):**
- *Nguồn (đề xuất, cần Vinh quyết)*: thêm cột `report_date_deli = DATE(enddeliverytime)`.
  Dashboard vận hành dùng cột này — mỗi ngày chốt xong là đứng yên, không censoring.
  Giữ `report_date` hiện tại cho phân tích SLA theo cohort ngày tạo.
- *App (làm ngay, không chờ SQL)*: cột `is_mature` tính ở view (mục 3.1):
  `report_date <= max(report_date) - 5 ngày`. Ngày chưa chín thì:
  - **không** được chọn làm ngày mặc định,
  - **không** vào baseline,
  - trên trend chart vẽ **nét đứt + màu nhạt** kèm nhãn "chưa chín", không cắt bỏ
    (cắt bỏ thì người dùng tưởng thiếu data).

  Con số 5 ngày lấy từ chính bảng trên (14/8 là ngày cuối còn lệch ≤1%; 19/8 − 14/8 = 5).
  Đặt thành hằng số `MATURITY_LAG_DAYS` trong view, review lại sau 1 tháng data.

### 2.3 Chặng NULL — đúng là ad hoc, loại được

Trả lời trực tiếp câu hỏi của Vinh:

| Cột | Số dòng NULL | % dòng | Đơn ảnh hưởng |
|---|---|---|---|
| `avg_lt_prepickup_hour` | 159 | 0,18% | 182 |
| `avg_lt_firstmile_hour` | 489 | 0,55% | 730 |
| `avg_lt_middlemile_hour` | 322 | 0,36% | 513 |
| `avg_lt_lastmile_hour` | 0 | 0% | 0 |
| `avg_lt_e2e_hour` | 0 | 0% | 0 |

Dòng có **ít nhất 1** chặng NULL: **489 / 88.480 = 0,55%**, ảnh hưởng **730 /
12.670.550 đơn = 0,006%**.

Pattern (pre/first/mid/last): `.NN.` 315 dòng · `NN..` 152 · `.N..` 15 · `NNN.` 7.

→ **Kết luận: ad hoc, loại tạm.** Quy tắc ở 2.5. Vì `lastmile` và `e2e` không bao
giờ NULL, sau khi loại thì **không còn chặng NULL nào** → bỏ được luôn yêu cầu
pattern gạch chéo (**B7** tự đóng, nhưng vẫn giữ code hatch cho trường hợp data
tương lai đổi).

### 2.4 Lane rỗng — cũng ad hoc nhưng đều đặn

87 dòng / 1.622 đơn (0,013%), cả 3 cột from/to/lane đều rỗng, rải **~2 dòng/ngày**,
cả SPE (45) và SPB (42). Không phải sự cố 1 lần → là `LEFT JOIN Shopee_Fallback`
trượt đều đặn, khả năng cao do cửa sổ `LoadDate` của `Dtm_KA_Shopee` không phủ hết
đơn có `CreatedDate_Partition` sát biên 46 ngày.

→ Loại khỏi phân tích, **giữ trong panel chất lượng dữ liệu** (4.6) để còn thấy nó
tồn tại. Đề xuất fix nguồn: nới `LoadDate` rộng hơn `CreatedDate_Partition`.

### 2.5 Σ4 chặng vs E2E — có lệch thật, tập trung ở Intra city SPB

Ở mức tổng, Σ4 chặng ≈ `avg_lt_e2e_hour` rất khớp (lệch −0,3% … +0,2%) cho hầu hết
lane × client. **Trừ một chỗ:**

| lane × client | Σ4 | E2E | lệch |
|---|---|---|---|
| Intra city **SPB** | 42,00h | 36,68h | **+14,5%** |
| Intra city SPE | 38,84h | 38,84h | +0,0% |
| Intra region SPB / SPE | 50,00 / 47,10 | 50,07 / 47,12 | −0,1% / −0,0% |
| Cross metro SPB / SPE | 85,54 / 75,31 | 85,70 / 75,38 | −0,2% / −0,1% |
| Cross region SPB / SPE | 76,41 / 76,03 | 76,51 / 75,97 | −0,1% / +0,1% |

Loại hết dòng NULL rồi **vẫn còn +14,5%** → không phải do NULL ở mức dòng.

Đào sâu: 2.358 / 81.920 dòng lệch >5% (5,04% sản lượng), tập trung ở
**HCM→HCM** và **HNO→HNO** Intra city SPB, lệch **+5 … +9,5h (+13% … +31%)**,
558.334 đơn = 93% tổng sản lượng bị lệch.

**Giả thuyết** (cần kiểm order-level, chưa xác nhận được từ file tổng hợp):
`AVG` từng chặng tính trên **tập đơn khác nhau** — đơn thiếu 1 mốc bị loại khỏi
`AVG` của chặng đó nhưng vẫn nằm trong `AVG(lt_e2e)` (vì e2e chỉ cần `createddate`
+ `enddeliverytime`, và cả 2 luôn có do filter). Cộng các average có mẫu số khác
nhau thì vượt.

**Đề xuất fix nguồn** (Vinh nói sẽ sửa query sau): thêm `COUNT` riêng từng chặng
(`mau_prepickup`, `mau_firstmile`, `mau_middlemile`, `mau_lastmile`), **hoặc** tính
4 chặng trên cohort chung (đơn có đủ 4 mốc) và giữ `mau`/`e2e` trên toàn bộ đơn
delivered. Có `COUNT` từng chặng thì app hiển thị được mẫu số thật và **B4 đóng
hẳn**.

**Cho tới khi đó**: UI **không** hiển thị "Σ4 chặng" như một con số tổng. Chiều cao
cột stacked vẫn là Σ4 (bản chất của stacked bar) nhưng nhãn tổng luôn là
`avg_lt_e2e_hour`, và có dòng chú thích khi |Σ4 − E2E| > 5%. Đóng **B4**.

### 2.6 Không có leadtime âm — hướng `DATE_DIFF` đã đúng

0 giá trị âm trên cả 5 cột / 88.480 dòng. Fix đảo tham số StarRocks trong SQL là đúng.

### 2.7 Outlier: có nhưng toàn `mau = 1`

Max: `lastmile` 418h (17,4 ngày), `e2e` 492h (20,5 ngày) — đều `mau=1`. Số dòng
> 14 ngày: firstmile 1 · middlemile 1 · lastmile 1 · e2e 14.

Và: **27,3% dòng có `mau < 5`** nhưng chỉ chiếm **0,417% sản lượng**. Phân bố
`mau`: p25=4 · trung vị=14 · p75=53 · p95=532 · max=37.945.

→ Đổi cách xử lý "mẫu ít" so với v1: **không gắn nhãn** (sẽ nhấp nháy trên 1/4
bảng), mà **lọc bỏ khỏi bảng/top-N mặc định**, có toggle "hiện cả tuyến mẫu ít".
Lọc mẫu ít cũng xử lý luôn outlier ở trên.

### 2.8 Số liệu tham chiếu (46 ngày, chỉ ngày đã chín)

| lane | client | đơn | pre | first | mid | last | E2E |
|---|---|---|---|---|---|---|---|
| Intra city | SPB | 624.906 | 7,75 | 9,71 | 15,22 | 9,32 | 36,68 |
| Intra city | SPE | 306.691 | 4,45 | 9,33 | 14,04 | 11,02 | 38,84 |
| Intra region | SPB | 1.022.286 | 6,24 | 10,51 | 17,71 | 15,54 | 50,07 |
| Intra region | SPE | 4.238.040 | 4,44 | 10,67 | 16,88 | 15,10 | 47,12 |
| Cross metro | SPB | 217.534 | 7,26 | 10,44 | **53,61** | 14,22 | 85,70 |
| Cross metro | SPE | 322.295 | 4,83 | 9,55 | **50,30** | 10,63 | 75,38 |
| Cross metro * | SPB | 83.202 | 6,80 | 9,31 | 34,25 | 15,45 | 65,96 |
| Cross metro * | SPE | 90.880 | 4,41 | 9,20 | 33,11 | 14,11 | 60,95 |
| Cross region | SPB | 838.935 | 6,26 | 10,40 | 42,45 | 17,29 | 76,51 |
| Cross region | SPE | 4.157.988 | 4,35 | 10,61 | 44,90 | 16,17 | 75,97 |

Dùng làm bộ số nghiệm thu: build xong, tab phải ra đúng những con số này.

Chú ý `Cross metro` có middle mile **cao nhất toàn mạng** (50-54h) nhưng sản lượng
nhỏ (536 dòng) — đúng loại insight mà code cũ đang **bỏ hẳn khỏi chart** (A2), và
là ví dụ cho việc top-N phải xếp theo impact chứ không theo % lệch.

---

## 3. Phase 0 — Nối data thật

### ✅ Đã làm

| Việc | Trạng thái |
|---|---|
| Apply migration `kas_leadtime_data` lên Supabase `iyjsihwgnzcytbojvoom` | ✅ Đã apply. Verify: 13 cột, RLS bật, 1 policy select cho `authenticated`, `sync_kas_leadtime_data` tồn tại, thêm index `(report_date)`, 0 dòng (chờ Apps Script) |
| `TAB_GIDS.leadtime = 396308004` trong `scripts/apps-script/sync-to-supabase.gs` | ✅ |
| `shopee/leadtime_chang_deli.sql` | ✅ Đã đưa vào repo, kèm block REVIEW ghi 5 phát hiện ở mục 2 |

### ⏳ Còn lại

1. **Chạy `syncAllTabs()` trên Apps Script** (Vinh chạy, mình không có quyền vào Sheet).
   Verify: `select count(*), max(report_date), min(report_date) from kas_leadtime_data`
   phải khớp 88.480 dòng / 05-07 → 19-08.

2. **⚠ Rủi ro payload — phải test trước khi tin.** `syncOneTab()` (dòng 110-119)
   `JSON.stringify` **toàn bộ** dòng vào 1 request:

   | tab | dòng | payload JSON ước tính |
   |---|---|---|
   | pick | 28.850 | ~7 MB (đang chạy được) |
   | deli | 29.621 | ~7 MB (đang chạy được) |
   | ca1 | 1.237 | < 1 MB |
   | **leadtime** | **88.480** | **~33 MB** |

   33MB là 4-5× tab lớn nhất đang chạy. Rủi ro: giới hạn body của API gateway
   Supabase, `UrlFetchApp` payload limit, và timeout 6 phút của Apps Script.

   **Nếu fail** → batch hoá, giữ nguyên tính atomic bằng staging table:
   ```sql
   -- migration mới
   create table kas_leadtime_data_staging (like kas_leadtime_data including defaults);
   create function sync_kas_leadtime_stage(payload jsonb) ...   -- chỉ insert vào staging
   create function sync_kas_leadtime_commit() ...               -- 1 transaction:
   --   delete from kas_leadtime_data;
   --   insert into kas_leadtime_data select ... from staging;
   --   truncate staging;
   ```
   Apps Script: `stage()` theo chunk 5.000 dòng → `commit()` 1 lần cuối.
   **Viết sẵn migration này trước, đừng chờ fail.**

3. **Xoá mock khỏi luồng chạy thật** + banner nguồn dữ liệu (2.4 của v1 plan):
   `App.jsx` thêm `leadtimeSource` (`'mock' | 'supabase' | 'csv'`), truyền xuống
   tab; `leadtimeSource === 'mock'` → banner cảnh báo bằng
   `src/components/ui/StatusNotice.jsx`. `leadtimeDataset.js` chuyển thành fixture
   chỉ dùng cho test, không còn là default state.
   `supabaseSheetSync.js` trả thêm `leadtimeError` để phân biệt "bảng rỗng" với
   "bảng không tồn tại".

---

## 3.1 Phase 0.5 — Tầng dữ liệu (MỚI, blocker)

### E3. Không thể đẩy 88k dòng thô về browser

Đo trên output thật:

| Chỉ số | Giá trị |
|---|---|
| Payload JSON (kèm `id` + `synced_at` như PostgREST trả) | **33,1 MB** (gzip ~2,3 MB) |
| Số request phân trang (`PAGE_SIZE = 1000`) | **89 round-trip tuần tự** |
| Trần an toàn hiện tại trong `fetchAllRows` | 100 trang = 100.000 dòng |
| Dư địa còn lại | **11.520 dòng ≈ 6 ngày** rồi **bị cắt âm thầm, không báo lỗi** |

Cộng thêm 59.708 dòng pick/deli/ca1 đang load sẵn → ~148k dòng mỗi lần mở app.

### E4. Code baseline hiện tại không chạy nổi ở quy mô thật

Benchmark `computeBaseline` hiện hành với đúng 88.480 dòng:

| Chế độ | Số lần gọi | Thời gian |
|---|---|---|
| 1 ngày (2.000 dòng bảng) | 8.000 | **~1,8 phút** (đo 5.290 lần = 72,2s → 13,6ms/lần) |
| Khoảng 7 ngày (~14.000 dòng bảng) | 56.000 | **~13 phút** (ngoại suy) |

Không phải "chậm" mà là **không dùng được**. Số v1 của plan (386ms / 2.710ms) tính
trên 6.540 dòng giả định — thực tế gấp 13,5 lần.

### Kiến trúc mới: tổng hợp + baseline ở Postgres

Thay cho hướng "index toàn bộ trong browser" của v1 (mục 3.2 cũ).

**a) View tổng hợp cấp lane** — cho tầng 1-3, nạp ngay khi mở tab:
```sql
create view v_kas_leadtime_lane_daily as ...
-- grain: report_date × externallane_new (đã normalize) × client_name
-- cột: mau, avg từng chặng (weighted theo mau), avg_lt_e2e_hour (weighted),
--      baseline từng chặng (rolling 28 ngày, loại chính ngày đó),
--      is_mature (report_date <= max(report_date) - 5 ngày),
--      n_rows, n_rows_excluded  (để panel chất lượng dữ liệu đối chiếu)
-- LOẠI ở đây: dòng có bất kỳ chặng NULL (2.3), dòng lane rỗng (2.4)
```
Kích thước: 46 ngày × 5 lane × 2 client ≈ **460 dòng**. So với 88.480 → **giảm 192×**.

**b) RPC cấp tuyến, nạp theo yêu cầu** — cho tầng 4-5:
```sql
create function get_kas_leadtime_pairs(
  p_date_from date, p_date_to date,
  p_lane text default null,      -- null = mọi lane
  p_client text default null,
  p_min_mau int default 5        -- lọc mẫu ít ngay ở server (2.7)
) returns table (...)
-- Trả tuyến (from,to,client) + weighted từng chặng + e2e + mau
--   + baseline từng chặng (rolling 28 ngày TRƯỚC p_date_from — đóng B1)
--   + baseline_level ('pair' | 'lane' — đóng B3)
```
Kích thước 1 lane × 7 ngày, `min_mau=5`: vài trăm dòng.

**c) Browser**: bỏ hẳn `fetchAllRows('kas_leadtime_data')` khỏi luồng mở app.
Chỉ đọc view (a) khi vào tab 3, gọi (b) khi mở bảng / drill-down.
`leadtimeCalc.js` giữ lại **chỉ** phần trình bày + phân loại (`classifyDeviation`,
format), không còn tính weighted/baseline. Đóng **A5**, **E3**, **E4**, **B1**, **B2**, **B3**.

**d) Refresh**: view thường (không materialized) là đủ ở cardinality này; nếu
chậm thì đổi sang materialized view + `refresh` ở cuối `sync_kas_leadtime_commit()`.

**e) Sửa trần cắt âm thầm** trong `fetchAllRows` (áp cho cả pick/deli): khi chạm
100 trang thì **throw**, không `break` im lặng. Đóng nguy cơ 6 ngày ở trên.

**Ngân sách nghiệm thu:**
| | Hiện tại | Mục tiêu |
|---|---|---|
| Payload mở tab 3 | 33,1 MB / 89 request | **< 200 KB / 1 request** |
| Render 1 ngày | ~1,8 phút | **< 50 ms** |
| Render khoảng 7 ngày | ~13 phút | **< 120 ms** |
| Đổi preset ngưỡng | tính lại toàn bộ | **< 16 ms** (chỉ phân loại lại) |

---

## 3.2 Phase 1 — Nền tảng phía client

### 3.2.1 Taxonomy lane dùng chung
Đóng **A2**. File mới `src/utils/laneTaxonomy.js`:
```js
export function normalizeLane(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }
export const LANE_DISPLAY_ORDER = ['intracity','intraregion','crossmetro','crossmetro*','crossregion'];
export function getLanesFromRows(rows, field = 'externallane_new') { ... } // lane lạ vẫn giữ, xếp cuối
export function getLaneLabel(normalizedKey, rows) { ... }
```
Refactor `Report5LaneCa1.jsx`: xoá `normalizeLane` local + `const lanes = [...]`
hardcode, import từ đây. **Cùng 1 hàm normalize phải dùng ở cả view SQL và JS** —
5 lane hiện tại normalize giống nhau ở 2 bên, có test đối chiếu (3.2.4 case 3).

### 3.2.2 Phân loại lệch 2 chiều
Đóng **B5**.
```js
// { pctDeviation, level: 'normal'|'warning'|'critical', direction: 'up'|'down'|'flat' }
// - Tăng vượt ngưỡng -> warning/critical.
// - Giảm > anomalyDropPct (40%) -> critical + direction 'down' + nhãn "nghi lỗi data".
// - Tăng dưới ngưỡng KHÔNG tô xanh: dùng --text-secondary. Chỉ 'down' trong biên
//   hợp lý mới tô --status-success-fg.
```
Không hardcode `#059669` — dùng token.

### 3.2.3 Preset ngưỡng
Đóng **C5-C7**.
```js
export const THRESHOLD_PRESETS = {
  strict: { label: 'Chặt',   warningThresholdPct: 10, criticalThresholdPct: 25 },
  normal: { label: 'Thường', warningThresholdPct: 20, criticalThresholdPct: 50 }, // default
  loose:  { label: 'Lỏng',   warningThresholdPct: 30, criticalThresholdPct: 75 }
};
export const BASELINE_CONFIG = {
  baselineWindowDays: 28, baselineMethod: 'mean', minDataPoints: 5,
  minMau: 5, anomalyDropPct: 40, maturityLagDays: 5
};
```
`baselineWindowDays` / `minDataPoints` / `maturityLagDays` giờ là **tham số của
view SQL**, không còn slider — đổi được nhưng phải sửa view, không phải kéo chuột.
Panel nâng cao (chỉ `isDevAdmin`) chỉ còn 4 ô ảnh hưởng client-side.
Ô nhập số: **local string state, commit khi blur/Enter** (đóng C6).
Warning ≥ Critical: **báo lỗi inline + disable Áp dụng**, không tự sửa (đóng C7).

### 3.2.4 Test
Đóng **D9**. `src/utils/*.test.mjs`, `"test": "node --test src/utils/*.test.mjs"`.

Case bắt buộc:
1. `getLanesFromRows` trả đủ 5 lane từ data có `"Intra city"`, `"INTRA CITY"`, `"Cross metro *"`, `"crossmetro*"`.
2. `normalizeLane` khớp chính xác kết quả của hàm normalize trong view SQL (bảng đối chiếu 5 giá trị thật).
3. `classifyDeviation`: `+9%` → `normal` + `direction 'up'` (KHÔNG xanh).
4. `classifyDeviation`: `−55%` → `critical` + `direction 'down'` + nghi lỗi data.
5. `classifyDeviation`: baseline `null`/`0` → `pctDeviation null`, không chia 0.
6. Format E2E: `undefined` / `''` / `null` → `'–'`, không ra `"undefinedh"` (đóng **B8**).
7. Maturity: chuỗi ngày 05-07…19-08 → `latestMatureDate = 2026-08-14`, 5 ngày cuối gắn `isMature=false`.
8. Impact ranking: tuyến `mau=1, +200%` **không** được xếp trên tuyến `mau=35.513, +13%`.
9. Bộ số 2.8: nạp fixture từ CSV thật → weighted theo lane × client ra đúng bảng 2.8 (sai số < 0,01h).

Fixture: cắt ~2.000 dòng từ output thật vào `src/utils/__fixtures__/leadtime-sample.csv`
(giữ đủ 5 lane + dòng NULL + dòng lane rỗng + ngày chưa chín). **Không** dùng
`leadtimeDataset.js` sinh bằng `Math.sin` làm fixture.

---

## 4. Phase 2 — Dựng lại UI

Đóng **C3**, **C4**, **A3**, **A4**, **A2b**, **B4**, **B6**, **C1**, **C2**, **C9**, **C12**.

```
src/components/ReportLeadtime/
  index.jsx                  ← orchestrator: filter + fetch + layout
  LeadtimeFilterBar.jsx
  LeadtimeVerdict.jsx        ← tầng 1  ┐
  LeadtimeStageCards.jsx     ← tầng 1  │ lớp HIGH LEVEL — luôn mở
  LeadtimeTrendChart.jsx     ← tầng 2  │
  LeadtimeLaneChart.jsx      ← tầng 3  ┘
  LeadtimeTopLanes.jsx       ← tầng 4  ┐
  LeadtimeDetailTable.jsx    ← tầng 5  │ lớp MID LEVEL — collapse, mở theo nhu cầu
  LeadtimeDataQuality.jsx    ← tầng 6  ┘
```
Chia 2 lớp theo câu trả lời "vừa high vừa mid level": high level đọc 3 tầng đầu là
xong, mid level bấm mở 3 tầng sau. Cùng 1 trang, cùng 1 bộ filter → số không lệch.

### 4.1 Tầng 1 — Câu trả lời

**a) Dòng kết luận** (`LeadtimeVerdict`), sinh tự động:
> Ngày 14/08 · SPE+SPB · 239.254 đơn. E2E **57,2h** (−1,0% vs baseline 28 ngày).
> Nút thắt: **Middle mile** ở **Cross metro** — 53,6h (+18% vs baseline), 217.534 đơn.
> 6 tuyến vượt ngưỡng cảnh báo.

Nút thắt chọn theo **impact** = `SUM(mau) × (current − baseline)` (giờ trễ cộng
dồn), không theo % lệch — nếu không thì tuyến `mau=1` lệch +200% sẽ luôn thắng
(2.7: 27,3% dòng có `mau<5`).

**b) 5 KPI card**: E2E · Pre-pickup · First mile · Middle mile · Last mile.
Mỗi card: giá trị weighted · delta vs baseline · sparkline 14 ngày (chỉ ngày đã
chín) · số đơn.

Dùng lại `.kpi-card`, `.kpi-card-title/main/pct/diff/chart/stats`,
`.kpi-cards-container`. `SparklineChart` và `AnimatedNumber` hiện là hàm local
trong `Report1MienVungHub.jsx` → **tách ra** `src/components/ui/`, Report1 import lại.

Card E2E: giá trị là `avg_lt_e2e_hour`. Khi |Σ4 − E2E| > 5% (2.5) thì thêm dòng nhỏ
"Tổng 4 chặng 42,0h — lệch do mẫu số từng chặng khác nhau" (đóng **B4**).

### 4.2 Tầng 2 — Xu hướng (`LeadtimeTrendChart`) — chart đang thiếu hẳn
- `LineChart`, X = `report_date`, 4 đường = 4 chặng, tuỳ chọn thêm E2E.
- Toggle cửa sổ 14 / 28 / 46 ngày (46 = toàn bộ data đang có).
- Ngày `is_mature = false`: nét đứt + màu nhạt + nhãn "chưa chín" (2.2). **Không cắt.**
- `ReferenceArea` vẽ band baseline cho chặng đang highlight.

### 4.3 Tầng 3 — Cấu trúc theo lane (`LeadtimeLaneChart`)
- Stacked bar, X = **lane động từ view** (5 nhóm, có cả `Cross metro`), stack = 4 chặng.
- `clientFilter === 'ALL'` → **2 chart cạnh nhau**, mỗi chart 1 client (đóng **C1**).
- Trục Y `domain={[0,'dataMax']}` — bỏ 25% khoảng trống (C3).
- `<Legend>` của recharts cho 4 chặng; bỏ legend tự dựng ghi sai tên client.
- Tên client từ 1 chỗ duy nhất `src/utils/clientLabels.js`:
  `SPB = 'Shopee Bulky'`, `SPE = 'Shopee Express'` (đóng **C2**).
- Tooltip: **chỉ chặng đang hover** + giá trị + % đóng góp + **baseline (số thật)** +
  cấp baseline + số đơn. Không in cả 2 client × 4 chặng (đóng **D8**, **B3**).
- Cao `min(420px, 45vh)`, `overflow-x: auto` dưới 640px (C10).

### 4.4 Tầng 4 — Top tuyến cần xử lý (`LeadtimeTopLanes`) — mới
- Top 10 theo **impact** (4.1a), không theo `e2e` desc — Cross region luôn cao
  nhất nên sort theo e2e là vô nghĩa.
- Mỗi dòng: `from → to` · lane · client · chặng gây lệch · giờ vs baseline · số đơn · badge.
- Bấm 1 dòng → set drill-down + scroll xuống tầng 5.
- Nguồn: RPC `get_kas_leadtime_pairs` với `p_min_mau = 5`.

### 4.5 Tầng 5 — Bảng chi tiết (`LeadtimeDetailTable`)
Chữa **A2b**, **A4**, **C9**, **C8**, **B6**:
- **Nhóm chính = lane**, mỗi lane 1 section collapse được; mặc định chỉ mở lane có cảnh báo.
- Bỏ cột "Nhóm Lane" (trùng group header).
- **Thêm cột "Ngày"**, chỉ hiện ở chế độ khoảng ngày.
- Chế độ khoảng ngày: mặc định **gộp theo tuyến** (weighted toàn kỳ, làm ở RPC) →
  1 dòng/tuyến/client. Checkbox "Hiện từng ngày" cho ai cần dòng thô.
- Lọc `mau >= 5` ở server; toggle "hiện cả tuyến mẫu ít" (2.7).
- Phân trang **50 dòng/lane** + "Hiện tất cả (N)".
- Mỗi ô chặng: giờ + % lệch + tooltip `baseline = X,Xh (cấp tuyến / cấp nhóm, N ngày)`.
- Canh lề: thêm vào `index.css`
  `.mtx-table td.cell-text { text-align: left; font-family: var(--font-sans); }`
  và dùng class cho cột `from → to` / lane — **không** set inline chỉ trên `<th>` (C8).
- Mobile: đóng băng cột tuyến (class có sẵn `index.css:2205`).
- Cột `MAU` → **`Số đơn`**; header CSV → `sample_size` (đóng **B6**).
- Một loại mũi tên duy nhất `→` (C11).

### 4.6 Tầng 6 — Chất lượng dữ liệu (`LeadtimeDataQuality`) — mới
Collapse, mặc định đóng. Hiển thị đúng những gì đã loại, để không ai nghĩ số bị ém:
- Dòng loại vì có chặng NULL: 489 dòng / 730 đơn (2.3), có bảng pattern.
- Dòng loại vì lane rỗng: 87 dòng / 1.622 đơn (2.4).
- Ngày chưa chín: 5 ngày cuối + đồ thị sản lượng theo ngày (2.2).
- Tuyến `mau < 5` bị lọc: số dòng + % sản lượng.
- Cảnh báo |Σ4 − E2E| > 5% theo lane × client (2.5).

### 4.7 Filter bar (`LeadtimeFilterBar`)
- **Ngày**: preset `Ngày mới nhất (đã chín)` · `7 ngày` · `28 ngày` · `Tuỳ chọn`.
  Mặc định = **ngày đã chín mới nhất**, KHÔNG phải `max(report_date)` (đóng **2.2**).
- Cạnh ô ngày ghi rõ: "Ngày mới nhất trong data là 19/08 nhưng chưa chín (1% sản
  lượng) — đang xem 14/08". Bấm được để xem ngày chưa chín nếu muốn.
- `min`/`max` input = biên `allDates`. Ngày không có data → **giữ lựa chọn** +
  hiện "Ngày này chưa có dữ liệu", **không tự nhảy** (đóng **A3**).
- Bỏ fallback hardcode `'2026-08-19'` (D6). `startDate` = `endDate − 6 ngày` theo
  **ngày lịch** (D5).
- Bỏ toggle SPB/SPE — dùng `clientFilter` từ header (B9). `App.jsx` phải truyền xuống.
- Drill-down **2 cấp**: chọn lane (5 mục) → mới hiện dropdown tuyến trong lane đó.
  Bỏ dropdown phẳng 1.157 mục (A2b).
- `Header.jsx` nhận `activeTab`, ẩn `Vùng` + `Loại Hub` khi ở tab 3.

### 4.8 Empty state
Đóng **C12**. 4 trạng thái: chưa sync · ngày trống · drill-down không khớp ·
lọc mẫu ít làm rỗng bảng (kèm nút bỏ lọc).

---

## 5. Phase 3 — Design system

Đóng **C11**. Giữ nguyên như v1:

| Việc | Mục tiêu |
|---|---|
| inline style | 133 → **< 20**; tạo section `/* ===== Tab Leadtime ===== */` trong `index.css` |
| hex hardcode | 25 → **0**, dùng token |
| bảng màu 4 chặng | token mới `--stage-prepickup/-firstmile/-middlemile/-lastmile` trong `tokens.css`, có bản `body.dark-mode`, phái sinh từ brand GHN |
| emoji heading | 11 → **0**, dùng icon lucide |
| chữ | sentence case, thuần Việt ("Xem sâu theo lane", "Khách hàng"), bỏ "Grouped by / Stacked by" |
| cỡ chữ / radius | chỉ dùng thang có sẵn + `--radius-control` / `--radius-surface` |
| copy ảnh | bỏ `alert()`, dùng state inline như `Report5LaneCa1` |
| export ảnh dark mode | `backgroundColor` đọc từ computed style của body |
| viền chặng highlight | `var(--text-main)` thay `#1e293b` |
| nút thoát fullscreen | bỏ nút tròn đỏ riêng, giữ Esc + `Minimize2` ở header |

---

## 6. Phase 4 — Dọn dẹp

| Việc | Đóng |
|---|---|
| Xoá `Report2TopSeller.jsx`, `Report3CaHub.jsx`, `Report4Focus1Vung.jsx` (~1.500 dòng chết) | D2 |
| Đổi `report6` → `report3`, component → `ReportLeadtime`; sửa `Sidebar`, `App`, mobile nav | D1 |
| `React.lazy` + `Suspense` cho tab 3 → recharts ra khỏi chunk chính | D3 |
| Bỏ `Number(config.x) \|\| default` (giá trị 0 bị thay ngầm) | D7 |
| `fetchAllRows` chạm trần 100 trang thì **throw** thay vì `break` im lặng | E3 |
| Xoá `Report6Leadtime.jsx`; `leadtimeDataset.js` → fixture cho test | A1 |

Ngân sách bundle: chunk chính **< 600 kB** (hiện 960 kB / 1 chunk).

---

## 7. Thứ tự thực hiện

```
Phase 0    Nối data thật ──────── ✅ migration + GID + SQL đã xong
           ⏳ Vinh chạy Apps Script; mình viết sẵn migration staging (rủi ro 33MB)
   │
Phase 0.5  View + RPC ở Postgres  ← BLOCKER kỹ thuật lớn nhất, làm ngay sau khi có data
   │
Phase 1    laneTaxonomy → classifyDeviation → preset → test + fixture
   │       (làm song song Phase 0.5 được)
   │
Phase 2    4.7 filter → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.8
   │
Phase 3    Design system (cuốn theo từng component, không dồn cuối)
   │
Phase 4    Dọn dẹp + code-split + xoá file cũ
```
Gate mỗi phase: `npm run test` && `npx oxlint src/` && `npm run build` && chụp
1600px + 390px, light + dark.

---

## 8. Acceptance criteria

| ID | Tiêu chí |
|---|---|
| A1 | `kas_leadtime_data` có 88.480 dòng; tab hiện nguồn + thời điểm sync; chế độ mock có banner |
| A2 | `Cross metro` + `Cross metro *` (536 dòng) xuất hiện trên chart; thêm dòng lane `"CROSS METRO"` vẫn gộp đúng |
| A2b | Trục chính chart + nhóm bảng = `externallane_new`; dropdown tuyến chỉ hiện sau khi chọn lane |
| A3 | Gõ ngày không có data → giữ lựa chọn + thông báo, không tự nhảy |
| A4 | Khoảng 7 ngày: bảng ≤ 50 dòng/lane, có cột Ngày, trang < 6.000px |
| A5 / E4 | Render 1 ngày < 50ms · 7 ngày < 120ms · đổi preset < 16ms |
| E3 | Payload mở tab 3 < 200KB / 1 request; `fetchAllRows` chạm trần thì throw |
| **2.2** | Ngày mặc định = **14/08** (chín) không phải 19/08; trend vẽ 5 ngày cuối nét đứt; filter bar giải thích lý do |
| **2.3** | 489 dòng NULL bị loại khỏi phân tích, hiện đủ trong tầng 6 |
| **2.4** | 87 dòng lane rỗng bị loại khỏi phân tích, hiện đủ trong tầng 6 |
| **2.5** | Intra city SPB hiện E2E 36,68h + chú thích lệch Σ4; không hiện Σ4 như con số tổng |
| **2.7** | Mặc định lọc `mau < 5`; có toggle; outlier 418h không lọt vào top-N |
| **2.8** | 10 dòng bảng 2.8 khớp đúng số tab hiển thị (sai số < 0,01h) |
| B1 | Baseline không chứa ngày nào trong kỳ đang xem |
| B2 / B3 | Mọi % lệch kèm baseline + cấp (`pair`/`lane`) + số ngày |
| B4 | Card E2E ghi rõ nguồn số; chú thích khi lệch > 5% |
| B5 | `+9%` không tô xanh; `−55%` gắn cờ nghi lỗi data |
| B6 | Không còn chữ "MAU" trong UI và header CSV |
| B8 | Thiếu cột E2E → `–`, không `undefinedh` |
| B9 | Client đổi ở header thì tab 3 đổi theo; `Vùng`/`Loại Hub` ẩn ở tab 3 |
| C1 / C2 | `ALL` → 2 chart riêng; SPB = "Shopee Bulky" ở mọi nơi |
| C3 / C4 | Có trend + top-N + 5 KPI card; high level đọc xong trong 1 màn hình đầu |
| C5-C7 | 3 preset; panel nâng cao chỉ dev admin; nhập được số 2 chữ số; sai ngưỡng thì báo lỗi |
| C8 / C9 | Header và nội dung canh cùng lề, cột text không font mono; bỏ cột trùng |
| C10 | 390px: chart scroll ngang, bảng đóng băng cột, không tràn |
| C11 | inline style < 20 · hex = 0 · emoji = 0 · 1 loại mũi tên |
| C12 | 4 empty state |
| D1-D7 | Theo bảng mục 6; chunk chính < 600 kB |
| D9 | `npm run test` xanh với 9 nhóm case ở 3.2.4 |

---

## 9. Còn cần Vinh

Đã chốt: GID `396308004` ✅ · SQL ✅ · NULL là ad hoc → loại ✅ · không có target ✅ ·
đối tượng high + mid level ✅.

Còn lại, đều là **query-side**, app không chờ được thì vẫn chạy theo phương án tạm:

1. **`report_date_deli = DATE(enddeliverytime)`** (2.2) — quan trọng nhất. Có cột này
   thì dashboard hết censoring hoàn toàn, bỏ được cả cơ chế `is_mature`. Chưa có thì
   app dùng phương án loại 5 ngày cuối.
2. **`COUNT` riêng từng chặng** hoặc tính 4 chặng trên cohort chung (2.5) — để đóng
   hẳn chuyện Σ4 ≠ E2E ở Intra city SPB (558k đơn). Chưa có thì app chỉ hiển thị E2E
   kèm chú thích.
3. **Nới cửa sổ `LoadDate`** của `Dtm_KA_Shopee` rộng hơn `CreatedDate_Partition`
   (2.4) — để hết 87 dòng lane rỗng.
4. **Chạy `syncAllTabs()`** và cho biết payload 33MB có qua được không (mục 3, việc 2).
   Nếu fail thì mình đã có sẵn migration staging + batch.
5. *(tuỳ chọn)* Trần cứng hoặc cắt p99 cho outlier ở nguồn (2.7) — hiện app lọc
   `mau < 5` là đủ, nhưng số nguồn sạch thì tốt hơn.
