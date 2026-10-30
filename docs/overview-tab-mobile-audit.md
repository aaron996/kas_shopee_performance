# Rà soát tab Tổng quan — trọng tâm trải nghiệm điện thoại

Ngày rà soát: 2026-10-30. Các mục P1 và P2 đã sửa (xem "Đã sửa" ở cuối); P3, P4
và danh sách widget vẫn là đề xuất, chưa làm.

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
