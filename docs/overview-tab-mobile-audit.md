# Rà soát tab Tổng quan — trọng tâm trải nghiệm điện thoại

Ngày rà soát: 2026-10-30. P1, P2 và vòng góp ý trực tiếp trên ảnh chụp màn hình
đã sửa (xem các mục "Đã sửa" ở cuối); P3, P4 và danh sách widget vẫn là đề xuất.

Phạm vi file: `src/modules/ops-metrics/OperationsHome.jsx`, `OverviewKpiCards.jsx`,
`OverviewTrend.jsx`, `overview.css`, `WeatherOverview.jsx`, `useOverviewMtd.js`,
`src/styles/mobile.css`, `src/styles/tokens.css`, và nhánh `overview` trong
`Report1MienVungHub.jsx` (nơi dựng `kpiCards` và `riskAlertHubs`).

## Cách đo

Chạy `npm run dev` với `VITE_LOCAL_BYPASS_AUTH=true`, xem ở viewport 375×812 và
360×740. Chế độ xem thử không có dữ liệu vận hành, nên phần KPI được đo thêm bằng
một trang harness tạm dựng đúng markup/CSS của `OperationsHome` với dữ liệu giả
(harness đã xoá sau khi đo). Các số dưới đây là chiều cao thực đo bằng
`getBoundingClientRect()`.

## Số đo hiện trạng (viewport 375×812)

| Khối | Chiều cao | Ghi chú |
| --- | --- | --- |
| Header (sticky) | 113 px | luôn chiếm chỗ |
| Panel thời tiết (đã thu gọn) | 370 px | bắt đầu ngay dưới header, y ≈ 121 |
| Khối KPI (`.overview-performance`) | 616 px | riêng lưới 5 card là 540 px |
| 1 card KPI | 188 px | card FD 165 px, chiếm trọn 1 hàng |
| Panel xu hướng | 396 px | chart 208 px |
| Panel "Hub cần theo dõi" | 581 px | 4 mục × 96 px |
| Bottom nav | 61 px | |
| Tổng chiều cao trang | ≈ 2.100 px | ~3 màn hình cuộn |

Hệ quả trực tiếp: **ô KPI đầu tiên bắt đầu ở khoảng y ≈ 500**, tức dưới nếp gấp
màn hình trên phần lớn điện thoại. Màn hình đầu tiên của tab Tổng quan hiện chỉ
hiển thị header + dự báo mưa.

## Vấn đề ghi nhận

### P1 — Màn hình đầu tiên không có KPI nào

Panel thời tiết (370 px) đứng trước khối KPI trong `OperationsHome.jsx`. Trên
desktop nó chỉ là một dải ngang; trên điện thoại nó xếp dọc thành gần nửa màn
hình. Người mở tab Tổng quan trên điện thoại phải cuộn mới thấy con số đầu tiên.

Đề xuất: trên mobile rút thời tiết về **một dòng** (icon + nhiệt độ + "Mưa cao
nhất 15–16h", bấm để mở chi tiết) và đặt **sau** khối KPI, hoặc giữ vị trí nhưng
chỉ còn một dòng. Giữ nguyên bố cục desktop.

### P1 — Card KPI quá cao, lặp thông tin

Mỗi card có 5 dòng: tên, số lớn, `MTD` + target, sản lượng + trễ, và **khoảng
ngày**. Khoảng ngày `1/10 T5 – 28/10 T4` lặp lại y hệt ở cả 5 card trong khi
heading của khối đã ghi đúng chuỗi đó (`MTD · 1/10 T5 – 28/10 T4`).

Đề xuất: bỏ `.overview-metric-date` trên mobile (chỉ giữ khi card có khoảng ngày
khác heading), gộp nhãn `MTD` vào heading khối. Ước tính giảm ~40 px/card,
tương đương ~200 px cho cả lưới.

### P1 — Chạm vào card KPI không thấy gì thay đổi

`onSelect` chỉ đổi state; biểu đồ xu hướng nằm cách đó ~600 px. Trên điện thoại,
người dùng chạm card rồi không thấy phản hồi nào ngoài dấu check nhỏ.

Đề xuất (chọn một): (a) `scrollIntoView` panel xu hướng khi chọn KPI trên mobile;
(b) nhúng sparkline 14 ngày ngay trong card (đã có sẵn `KpiSparkline` /
`MiniSparkline`), để việc chọn KPI không còn là điều kiện bắt buộc để thấy xu hướng.

### P2 — Ba mốc thời gian trên cùng một màn hình, không nói rõ

- Card KPI: **MTD**
- Số lớn ở panel xu hướng: **D-1** (`card.d1.pct`)
- Danh sách Hub: **D-1**, và tiêu đề phụ không ghi ngày nào cả.

Đề xuất: thêm ngày D-1 vào tiêu đề phụ của "Hub cần theo dõi", hoặc thêm một
segmented control `D-1 / MTD` điều khiển cả ba khối.

### P2 — Không thấy phạm vi đang lọc

Client (SPE / SPB / Reverse), Vùng, Loại Hub chỉ là ba nút icon trong header
(`HeaderPopover`), không có nhãn chữ ở bất kỳ breakpoint nào. Trên điện thoại,
người xem con số MTD không biết nó thuộc client nào nếu không bấm mở popover.

Đề xuất: một dải scope gọn ở đầu tab Tổng quan — `SPE · 15/15 vùng · Tất cả loại
Hub` — bấm vào thì mở đúng popover tương ứng.

### P2 — Badge số cảnh báo Hub gây hiểu nhầm

`riskAlertHubs` sắp xếp theo lượng trễ tuyệt đối rồi `.slice(0, 4)`
(`Report1MienVungHub.jsx:457`). Badge cạnh tiêu đề hiển thị `risks.length`, nên
khi có 40 hub dưới target nó vẫn hiện `4`, và aria-label đọc là "4 cảnh báo Hub".

Đề xuất: hiển thị dạng `4/40`, hoặc đổi nhãn thành "Top 4 theo lượng trễ".

### P3 — Danh sách Hub còn mỏng thông tin

Chỉ lấy D-1, chỉ 1st Pickup và 1st Deli (không có OPR/ODR/FD), không có xu hướng.
Một hub trễ 1 ngày và một hub trễ 5 ngày liên tiếp trông giống hệt nhau.

Đề xuất: thêm badge "x ngày liên tiếp dưới target", và cho danh sách bám theo
KPI đang chọn ở trên.

### P3 — Không có cách làm mới dữ liệu ngay trên tab

Nút đồng bộ nằm trong popover header. Trên điện thoại, một dòng "Cập nhật lúc
HH:mm" kèm nút làm mới trong heading khối KPI sẽ hợp thao tác hơn.

### P3 — Khoảng 601–768 px vẫn giữ lưới 5 cột

`overview.css` chuyển sang bố cục mobile ở `max-width: 600px`, nhưng
`mobile.css` dùng `max-width: 768px`. Ở dải giữa (điện thoại xoay ngang, tablet
nhỏ) mỗi card KPI chỉ rộng 136 px — đọc được nhưng chật. Không hỏng, ưu tiên thấp.

### P4 — Tràn nhỏ ở 360 px

`.overview-comparison-note` có `scrollWidth` 322 px trong khung 310 px (do
`justify-content: space-between` cộng margin âm của icon). Lệch ~12 px.

## Widget có thể thêm (đều dùng lại thứ đã có trong repo)

| Widget | Nguồn sẵn có | Vì sao hợp mobile |
| --- | --- | --- |
| Thẻ "Nhận xét D-1" nội tuyến (3 gạch đầu dòng) | `buildExecutiveSummary` / `formatExecutiveSummary` trong `src/utils/executiveSummary.js` | hiện chỉ mở được qua modal; đọc thẳng trên trang nhanh hơn trên điện thoại |
| Sparkline trong card KPI | `KpiSparkline.jsx`, `MiniSparkline.jsx` | thấy xu hướng không cần cuộn |
| Tóm tắt theo Miền (Bắc/Trung/Nam) cho KPI đang chọn | `MIEN_REGIONS` + hàm tổng hợp sẵn trong `Report1MienVungHub.jsx` | một chạm là drill xuống, thay vì mở tab Vùng/Hub |
| Dải thời tiết một dòng | `WeatherOverview` (rút gọn phần `weather-compact`) | giữ được lý do nghiệp vụ (mưa ảnh hưởng giao hàng) mà không tốn 370 px |

## Chưa xác nhận

- Chưa đo chi phí tính toán của `kpiCards` / `useOverviewMtd` trên máy thật cấp
  thấp. Không kết luận gì về hiệu năng khi chưa đo.
- Toàn bộ số đo lấy từ Chromium trong pane preview, không phải Safari iOS.
  `100dvh`, `env(safe-area-inset-*)` và sticky header cần kiểm lại trên máy thật.

## Đã sửa (2026-10-30)

Ba mục P1. Desktop giữ nguyên bố cục: mọi thay đổi bố cục nằm trong
`max-width: 600px`, trừ việc bỏ dòng ngày trùng lặp (áp dụng mọi breakpoint vì
nó là thông tin lặp ở cả desktop).

### P1-1 — Thời tiết rút gọn và chuyển xuống dưới khối KPI

`OperationsHome.jsx` theo dõi `(max-width: 600px)` bằng `matchMedia` và render
`WeatherOverview` ở hai vị trí khác nhau trong JSX (không dùng CSS `order`, để
thứ tự DOM và thứ tự tab luôn khớp thứ tự nhìn thấy). Dưới 600px panel nằm sau
khối KPI và sau `dataNotice`.

Đánh đổi: khi viewport vượt qua mốc 600px (xoay máy), `WeatherOverview` đổi vị
trí trong cây JSX nên bị unmount/remount — panel đang bung sẽ thu gọn lại. Địa
điểm đã chọn không mất vì nằm trong `sessionStorage`.

`weather.css` thêm một khối `max-width: 600px` chỉ áp dụng khi panel đang thu
gọn (`:has(.weather-expanded[hidden])`): địa điểm + nhiệt độ về cùng một dòng,
icon 36px, nhiệt độ 24px, ẩn dòng mô tả phụ, ẩn `.weather-coverage` và hai span
đầu của `.weather-compact-metadata`. **Link WeatherAPI.com (span cuối) luôn hiển
thị** — đây là yêu cầu attribution của nhà cung cấp. Bung panel ra thì mọi thứ
trở lại đầy đủ (đã kiểm: metadata 2 span `block`, coverage `block`).

Đã xoá 3 rule `.weather-compact-icon` chết: icon render bằng
`.weather-paper-icon` / `.weather-paper-fallback` từ PR #212, nên các rule cũ
(width 34px, `display:none` ở ≤380px) không còn chạm vào gì.

### P1-2 — Card KPI gọn lại

- `OverviewKpiCards` nhận thêm prop `headingRange`; dòng ngày của card chỉ render
  khi khoảng ngày của KPI đó **khác** khoảng ghi ở heading. Thực tế chỉ còn FD
  hiện dòng này (dữ liệu FD thường kết thúc sớm hơn pickup/deli 1–2 ngày).
- Dưới 600px `.overview-metric-volume` trở lại `flex-direction: row`; vì nó vẫn
  `flex-wrap: wrap` nên sản lượng và số trễ nằm chung một dòng khi vừa, tự xuống
  dòng khi không vừa — thay cho việc luôn tốn hai dòng.

### P1-3 — Chạm card KPI thì cuộn tới biểu đồ

`selectMetric` gọi `scrollIntoView({ block: 'start' })` lên panel xu hướng khi
đang ở mobile. `.overview-trend-panel` có `scroll-margin-top: calc(var(--app-header-height, 112px) + var(--space-3))`
để không bị header sticky che.

Cuộn **tức thì**, không smooth: trong trình duyệt preview `behavior: 'smooth'`
là no-op hoàn toàn (đo được: cuộn 0px) dù `prefers-reduced-motion` báo
`no-preference`. Một hiệu ứng có thể im lặng không chạy sẽ làm mất đúng cái phản
hồi đang cần thêm, nên chọn nhảy thẳng. Nếu muốn smooth thì phải kiểm trên máy
thật trước.

### Kết quả đo lại

| Khối | Trước | Sau |
| --- | --- | --- |
| Panel thời tiết thu gọn @375 | 370 px | 183 px (3 hàng do rule ≤380px) |
| Panel thời tiết thu gọn @390 | 370 px | 131 px (2 hàng) |
| 1 card KPI | 188 px | 140 px |
| Lưới KPI | 540 px | 444 px |
| Khối KPI | 616 px | 520 px |
| Vị trí card KPI đầu tiên | y ≈ 500 | y ≈ 129 |
| Tổng chiều cao trang | ≈ 2.100 px | ≈ 1.530 px |

Desktop @1024 kiểm lại: vẫn 5 cột, chọn KPI không cuộn, chỉ FD hiện dòng ngày
riêng, `.overview-metric-volume` vẫn xếp dọc như cũ.

### Giới hạn kiểm thử

Đo trên Chromium trong preview pane, dữ liệu KPI là dữ liệu giả dựng đúng markup
của `OperationsHome` (harness tạm, đã xoá). Phần thời tiết đo trên app thật ở chế
độ xem thử nên có thêm dòng thông báo "Chế độ xem thử" (~66px) không có ở
production — số 183/131 px đã trừ phần này. Chưa kiểm trên Safari iOS.

`npm run lint` không phát sinh cảnh báo mới. `npm test`: 809/809 pass (trước đó 2
test fail vì worktree thiếu `@modelcontextprotocol/sdk`, đã `npm install`;
`package-lock.json` không đổi).

## Đã sửa — P2 (2026-10-30)

### P2-1 — Dải scope ở đầu tab

`OperationsHome` render `ScopeStrip`: ba chip `Client · Vùng · Loại Hub` đặt trên
cùng, trước cả thời tiết, ở mọi breakpoint. Chữ dùng đúng cách diễn đạt của
header (`Tất cả vùng`, `12/18 vùng`, `Chưa chọn vùng`), kể cả trường hợp chưa có
dữ liệu nên `allHubTypes` rỗng — khi đó hiện "Tất cả loại Hub" giống header chứ
không phải "Chưa chọn loại Hub".

Chip đang ở trạng thái lọc sạch (0 vùng hoặc 0 loại Hub) đổi sang viền/chữ đỏ, vì
đó chính là lúc mọi con số bên dưới trống mà không rõ lý do.

Bấm chip thì mở đúng popover tương ứng trên header, qua `CustomEvent`
`open-scope-popover` (`Header.jsx` lắng nghe và `setPopover({ name, pinned: true })`).
Theo đúng cách `open-export-dialog` đang dùng sẵn trong repo. Đã kiểm trên mobile:
bấm chip Client → popover mở dưới header → chọn SPB → chip đổi thành SPB.

Chiều cao dải: 32px trên desktop, 44px trên mobile (chạm được). Ở 360px, cấu hình
mặc định (SPE/SPB + Tất cả vùng + Tất cả loại Hub) nằm gọn một hàng; riêng
"SPE Reverse" đẩy chip thứ ba xuống hàng hai (96px), không tràn ngang.

### P2-2 — Panel Hub ghi rõ ngày

Tiêu đề phụ thành `1st Pickup / 1st Deli · lượng trễ cao nhất · D-1 28/10 T4`.
Pickup và deli có thể dừng ở hai ngày khác nhau, nên khi lệch thì ghi cả hai:
`Pickup 28/10 T4 · Deli 27/10 T3`. Không còn trường hợp danh sách D-1 nằm cạnh
card MTD mà không nói nó là ngày nào.

### P2-3 — Badge Hub nói đúng số

`riskAlertHubs` tách làm hai: `riskAlertAll` giữ nguyên danh sách đã sắp xếp,
`riskAlertHubs` lấy top 4 như cũ. Badge nhận thêm `riskTotal` và hiển thị `4/41`
thay vì `4`, aria-label đọc "Hiển thị 4 trong 41 Hub dưới target". Khi tổng số
không vượt quá số hiển thị thì vẫn chỉ hiện một số.

`allHubTypes` được truyền thêm vào `runtimeByModule.home` trong `App.jsx` và vào
`Report1MienVungHub` để dựng chip Loại Hub.

### Kiểm lại

Mobile 390px: dải scope 44px, không tràn ngang, tổng chiều cao trang 1.603px
(tăng 77px so với sau P1 — chi phí của dải scope và dòng ngày dài hơn, vẫn thấp
hơn nhiều so với 2.100px ban đầu).
Desktop 1280px: lưới KPI vẫn 5 cột, dải scope 32px, không tràn ngang.
`npm run lint` không có cảnh báo mới; `npm test` 809/809 pass.

## Đã sửa — vòng góp ý trên ảnh chụp màn hình (2026-10-30)

Góp ý đánh dấu trực tiếp lên ảnh bản production: bỏ những thứ lặp hoặc không cần
trên điện thoại.

### Header điện thoại: 2 hàng → 1 hàng (113px → 61px)

Bỏ chữ "GHN Performance", nút Dev và nút Đăng xuất khỏi hàng thương hiệu; bỏ nút
Đồng bộ và nút Nhận xét D-1 khỏi thanh công cụ. Còn lại một hàng: nút sáng/tối ·
(bộ lọc, ở các tab khác) · Tìm kiếm · Tải CSV.

Dev Panel, Nhận xét D-1 và Đăng xuất chuyển vào menu **"Thêm"** của bottom nav,
ngăn cách bằng một đường kẻ. Trên desktop ba thứ này vốn đã nằm ở sidebar và
thanh header, nên desktop không đổi.

### Ba icon lọc trên tab Tổng quan

Ở tab Tổng quan, dải scope chip trên trang đã nói đủ nên ba icon Client / Vùng /
Loại Hub trong header bị ẩn (`.scope-filter-cluster.is-replaced`). **Popover vẫn
được mount** — chỉ ẩn phần nút bấm — vì chính các chip mở chúng; ẩn cả cụm thì
chip sẽ thành nút chết. Các tab khác (Vùng/Hub, % Ca 1…) không có dải scope nên
vẫn giữ nguyên ba icon.

### Khối KPI

- Bỏ dòng "Lũy kế từ đầu tháng"; nút (i) lên cùng hàng với `MTD · 1/10 – 29/10`.
  Nội dung tooltip giữ nguyên câu giải thích đó. Heading 2 hàng → 1 hàng.
- Bỏ chữ "MTD" trong từng card. Giữ lại dạng `.sr-only` để tên đọc được của nút
  vẫn có mốc thời gian.
- Thay chữ "Target" bằng icon bia ngắm (lucide `Target`), chỉ còn `◎ ≥97%`, kèm
  `aria-label="Target MTD ≥97%"`. Không dùng icon "mũi tên cắm vào bia" vì ở
  14px nó thành một vệt mực; bia ngắm ba vòng tròn là hình đọc được nhỏ nhất.
- Card FD không có target nên mất hẳn hàng này: 165px → 139px.

### Nút "!" khi nguồn có dữ liệu mới

Thay cho nút Đồng bộ trên điện thoại (trình duyệt đã có vuốt-để-tải-lại), và
thêm cho cả desktop. Code: [`src/utils/dataFreshness.js`](../src/utils/dataFreshness.js),
test `src/utils/dataFreshness.test.mjs`.

`sync_kas_*_data()` thay toàn bộ bảng (delete + insert) nên `id` và `synced_at`
của dòng cuối đổi sau mỗi lần sync. Vì vậy chỉ cần đọc **một dòng mỗi bảng** là
biết nguồn đã chạy lại hay chưa — đúng mẹo boundary mà
`supabaseTableReader.js` đang dùng để phát hiện bảng bị thay giữa chừng.

- `fingerprintSnapshot(payload)` lấy mốc từ chính snapshot đang hiển thị, bất kể
  nó đến từ sync thật hay từ cache IndexedDB (cả hai đều giữ cột `id`/`synced_at`
  ở dạng thô). Nhờ vậy mở app bằng cache cũ cũng phát hiện được là đã có số mới.
- `readFreshnessMarks` đọc 5 dòng, mỗi bảng một dòng, timeout 8s. **Bảng nào đọc
  lỗi thì bỏ qua**, không bao giờ báo "có dữ liệu mới" vì một lần rớt mạng.
- `hasNewerData` chỉ bật khi một dataset có mốc ở cả hai phía và mốc khác nhau.
- Chạy khi người dùng quay lại tab (`visibilitychange`, `focus`) và mỗi 10 phút
  khi tab đang mở, chặn trùng trong vòng 2 phút, và không chạy khi đang sync.
  5 truy vấn một dòng là không đáng kể so với 150–200 request của một lần sync
  đầy đủ.
- Nút hiện ở header (cả mobile lẫn desktop) với nền hổ phách, bấm thì chạy
  `handleSyncLiveSheet`. Biến mất ngay khi `applySupabaseRows` chạy.

### Kiểm lại

| | Trước vòng này | Sau |
| --- | ---: | ---: |
| Header điện thoại | 113 px | 61 px |
| Heading khối KPI | 2 hàng | 1 hàng (53 px) |
| 1 card KPI | 140 px | 140 px |
| Card FD | 165 px | 139 px |
| Lưới KPI | 444 px | 418 px |
| Khối KPI | 520 px | 472 px |

Tab Vùng/Hub kiểm lại: ba icon lọc vẫn còn (cụm rộng 132px), header vẫn 1 hàng.
Desktop 1280px: sync, Nhận xét D-1, mật độ bảng, toàn màn hình, xuất CSV đều còn;
chip Loại Hub mở đúng popover.

`npm run lint` không có cảnh báo mới. `npm test` 815/815 pass (thêm 6 test của
`dataFreshness`).

**Chưa kiểm được bằng dữ liệu thật:** nút "!" chỉ được kiểm bằng unit test và
bằng cách chèn tay nút vào DOM để xem style. Luồng "nguồn chạy sync → nút hiện"
cần một phiên đăng nhập thật đúng lúc job sync chạy.
