# Impeccable Audit — GHN KAS "Báo Cáo Điều Hành Shopee"

Ngày: 2026-08-24 · Phạm vi: toàn app (4 tab: Report1 nationwide, % Ca 1, Leadtime, Insight) ·
Nguồn: static detector (`impeccable detect --json src/`, 12 finding) + đọc trực tiếp `src/index.css`
(2600+ dòng) và `src/styles/tokens.css` + kiểm tra DOM/computed style qua Browser MCP trên
`http://localhost:5173`.

> **Cập nhật cùng ngày — đã sửa hầu hết finding P1/P2/P3 bên dưới.** Xem mục
> "Trạng thái xử lý" cuối file để biết chỗ nào giữ nguyên có chủ đích và vì sao.
> Detector sau khi sửa còn 5/12 finding (3 side-tab đã review là false-positive,
> 2 layout-transition đã giảm nhẹ bằng `contain` thay vì đổi kiến trúc).

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3/4 | Text-muted contrast ở light mode chỉ 4.76:1 (sát ngưỡng AA 4.5:1) |
| 2 | Performance | 3/4 | 3 chỗ animate `width`/`padding-left` (layout thrash) |
| 3 | Theming | 2/4 | Hệ token bị **một block dark-mode trùng lặp đè lên** (chi tiết bên dưới) |
| 4 | Responsive Design | 3/4 | Có mobile nav + overflow-x riêng cho chart, chưa test thiết bị thật |
| 5 | Implementation Integrity | 2/4 | Trùng lặp hệ thống dark-mode, CSS chết, 74 `!important`, 4 anti-pattern "AI slop" |
| **Total** | | **13/20** | **Acceptable — cần xử lý có chủ đích, không phải overhaul** |

## Implementation Integrity Verdict — **Có vấn đề thật, không phải cảm tính**

App có một hệ token thiết kế khá nghiêm túc ở [tokens.css](src/styles/tokens.css) — có cả ghi chú
kiểm tra độ tương phản và mù màu (CVD) cho bộ màu 4 chặng leadtime. Nhưng **có một block
`body.dark-mode { ... }` thứ hai, cũ hơn, nằm ngay trong `index.css` (dòng 2286+)**, định nghĩa lại
đúng những biến CSS cốt lõi (`--surface`, `--text-main`, `--border`, `--bg-main`...) bằng giá trị hex
viết tay, khác với giá trị mà `tokens.css` đã tính toán kỹ.

Vì `index.css` `@import` `tokens.css` ở dòng đầu tiên rồi mới định nghĩa lại cùng selector
`body.dark-mode` ở dòng 2286, theo thứ tự cascade **CSS ở index.css luôn thắng** — tức là phần lớn
component (dùng `--surface`, `--text-main`, `--border`) đang chạy dark mode theo bộ giá trị *cũ*,
trong khi số ít token có tên mới (`--surface-canvas`, `--text-primary`, `--stage-*`) mới thật sự dùng
bộ giá trị đã được kiểm tra tương phản. Đây chính là lý do UI "cảm giác không đồng nhất" dù nhìn qua
code thấy có vẻ đã dùng token đầy đủ — **hai hệ thống token đang âm thầm tranh nhau**, không phải do
thiếu token.

Bằng chứng cụ thể (đều đã đọc trực tiếp trong file, không suy đoán):

```
tokens.css:109   body.dark-mode { --surface-default: #1e293b; ... }   ← hệ mới, có kiểm tra contrast
index.css:2286   body.dark-mode { --surface: #131c31; ... }           ← hệ cũ, đè lên vì load sau
```

`--text-muted` ở 2 hệ tình cờ trùng giá trị (`#94a3b8`) nên không lộ ra, nhưng `--surface`/`--border`/
`--text-main` thì lệch — nghĩa là các card dùng `var(--surface)` (đa số dashboard) và các phần dùng
`var(--surface-default)` (số ít) đang ra 2 tông nền tối khác nhau trong cùng 1 trang.

## Chi tiết theo mức độ ưu tiên

### P1 — Major

**[P1] Hai hệ dark-mode token cạnh tranh nhau**
- **Vị trí**: [src/index.css:2286-2360](src/index.css#L2286), trùng tên biến với [src/styles/tokens.css:109-120](src/styles/tokens.css#L109)
- **Danh mục**: Theming / Implementation Integrity
- **Ảnh hưởng**: Dark mode của phần lớn UI (KPI card, modal, filter...) chạy trên bộ màu cũ chưa qua kiểm tra tương phản, thay vì bộ màu đã được `tokens.css` tính CVD/contrast kỹ. Là nguồn gốc hợp lý nhất cho cảm giác "design system out of place" mà bạn nói.
- **Đề xuất**: Xoá block `body.dark-mode {...}` cũ trong `index.css` (dòng 2286 trở đi) và mọi override lẻ dùng hex trùng tên biến (dòng 973-1013), để toàn bộ dark mode chỉ còn một nguồn sự thật là `tokens.css`.
- **Lệnh gợi ý**: `/impeccable harden` (dọn drift dark-mode) hoặc `/impeccable extract` (gom mọi hex rời rạc về token) rồi `/impeccable polish`.

**[P1] 74 lần dùng `!important` trong index.css**
- **Vị trí**: rải rác `src/index.css` (ví dụ dòng 2321-2333 cho `.metric-header`, `.metric-title`, `.metric-target`)
- **Danh mục**: Implementation Integrity
- **Ảnh hưởng**: Dấu hiệu kinh điển của "specificity war" — mỗi lần sửa theme sau này sẽ phải đoán block nào thắng, dễ tạo thêm bug tương tự finding trên.
- **Đề xuất**: Sau khi gộp 2 hệ dark-mode, phần lớn `!important` này không còn cần thiết vì không còn 2 rule cùng selector tranh specificity.

### P2 — Minor

**[P2] Highlight "Kỳ đang xem" trên chart trend (Tab 3) — đã sửa trong session trước**
- Đã fix ở commit `9cc57b0`, nêu lại ở đây để audit không báo trùng khi chạy lại.

**[P2] 3 chỗ animate layout property (`width`, `padding-left`)**
- **Vị trí**: `src/index.css:159, 2883, 3074`
- **Danh mục**: Performance
- **Ảnh hưởng**: Animate `width`/`padding` gây layout thrash, giật khi máy yếu — nên đổi sang `transform`.
- **Lệnh gợi ý**: `/impeccable optimize`

**[P2] 4 "side-tab accent border" — anti-pattern AI-slop kinh điển**
- **Vị trí**: `src/index.css:1489` (`.sub-table-container`, dùng `--ghn-orange`), `2478`, `3148` (hex `#e8362c` trùng lặp thay vì token), `3752` (`.lt-verdict--alert`, dùng `--status-success-fg`... tên biến không khớp ý nghĩa, đáng xem lại)
- **Danh mục**: Slop / Theming
- **Ảnh hưởng**: Không sai chức năng, nhưng là dấu hiệu UI "nhìn giống AI generate" theo detector, và 2 trong 4 chỗ dùng hex thay vì token.
- **Lệnh gợi ý**: `/impeccable polish`

**[P2] 5 chỗ dùng bounce/elastic easing (`--ease-spring`, `cubic-bezier(0.34,1.56,...)`)**
- **Vị trí**: `src/index.css:70, 81, 2897`; `src/styles/tokens.css:52, 54`
- **Danh mục**: Slop / Motion
- **Ảnh hưởng**: Easing nảy (overshoot >1) tạo cảm giác "rẻ tiền" theo chuẩn thiết kế hiện đại; nên đổi sang `ease-out-quart/quint`.
- **Lệnh gợi ý**: `/impeccable animate`

### P3 — Polish

**[P3] CSS chết: `.report4-grid`, `.sub-table-container`, `.sub-table-title`**
- **Vị trí**: `src/index.css:1481-1495` — không có JSX nào dùng các class này (đã `grep` xác nhận).
- **Danh mục**: Implementation Integrity
- **Ảnh hưởng**: Không ảnh hưởng người dùng, nhưng làm file CSS phình to và dễ gây nhầm khi sửa sau này (đặc biệt nó cũng đang hardcode `#f8fafc`, `#111 !important`).
- **Lệnh gợi ý**: `/impeccable distill`

**[P3] Text-muted contrast sát ngưỡng AA (4.76:1 trên nền trắng)**
- **Vị trí**: `--text-secondary: #64748b` ([tokens.css:9](src/styles/tokens.css#L9)), dùng rộng khắp cho phụ chú/label
- **Danh mục**: Accessibility
- **Ảnh hưởng**: Qua ngưỡng AA (4.5:1) nhưng không nhiều dư địa — chữ nhỏ hơn 1 chút hoặc màn hình kém sẽ khó đọc.
- **Lệnh gợi ý**: `/impeccable typeset`

## Pattern & vấn đề hệ thống

- **Hai hệ token dark-mode song song** là vấn đề gốc rễ lớn nhất — không phải một lỗi lẻ mà là kiến trúc: `tokens.css` (mới, có kiểm chứng) bị `index.css` (cũ hơn, viết tay) đè lên do thứ tự cascade. Mọi finding Theming khác đều là hệ quả của việc này.
- **246 mã hex xuất hiện trong `index.css`** ngoài file token — phần lớn là do 2 hệ thống trên, một phần là do các đoạn CSS cũ (report4, risk-chip...) chưa từng được refactor sang token khi `tokens.css` ra đời.

## Positive Findings

- `tokens.css` cho phần leadtime (`--stage-*`) làm rất kỹ: có ghi chú kiểm tra CVD (mù màu) và tỷ lệ tương phản ngay trong comment — hiếm thấy ở dashboard nội bộ.
- Số liệu dùng `font-variant-numeric: tabular-nums` nhất quán ở các nơi cần so sánh số (KPI card, bảng, tooltip) — chi tiết nhỏ nhưng đúng chuẩn.
- Icon-only button hầu hết có cả `title` và `aria-label` (đã kiểm tra qua DOM), không phải kiểu "button rỗng không ai đọc được".
- Chart Leadtime tab 3 đã tách CSS theo BEM-ish namespace (`lt-*`) rõ ràng, dễ audit hơn hẳn phần còn lại.

## Recommended Actions (theo thứ tự ưu tiên)

1. **[P1] `/impeccable harden`**: Gộp 2 hệ dark-mode thành một, xoá block trùng ở `index.css:2286+` và `973-1013`.
2. **[P1] `/impeccable extract`**: Gom các hex rời rạc còn lại (246 chỗ) về token, ưu tiên các class đang thật sự dùng (bỏ qua CSS chết).
3. **[P2] `/impeccable optimize`**: Sửa 3 chỗ animate layout property.
4. **[P2] `/impeccable animate`**: Đổi 5 easing bounce/elastic sang ease-out chuẩn.
5. **[P2] `/impeccable polish`**: Dọn 4 side-tab accent border.
6. **[P3] `/impeccable distill`**: Xoá CSS chết (`report4-grid`, `sub-table-container`).
7. **[P3] `/impeccable typeset`**: Xem lại contrast `--text-secondary`.
8. **`/impeccable polish`** (cuối cùng): pass tổng để đảm bảo các fix trên không tạo lệch mới.

Bạn có thể nhờ mình chạy các lệnh này lần lượt, gộp lại, hoặc chọn thứ tự khác.
Chạy lại `/impeccable audit` sau khi sửa để xem điểm cải thiện.

## Trạng thái xử lý (cập nhật 2026-08-24, cùng ngày)

| Việc | Trạng thái | Ghi chú |
|---|---|---|
| P1 — Hai hệ dark-mode token cạnh tranh | ✅ Đã sửa | Xem "Lưu ý kỹ thuật quan trọng" bên dưới — cách sửa ban đầu suýt làm hỏng dark mode, đã tự phát hiện qua verify và sửa lại đúng. |
| P1 — 74 `!important` | ⏸️ Không đụng | Phần lớn nằm ở các rule `.metric-header/.metric-title/.metric-target` v.v. dùng để thắng specificity với rule khác đang tồn tại song song — gỡ `!important` mà không dọn luôn các rule cạnh tranh đó dễ gây regression ẩn. Để riêng cho một lượt "harden" có kiểm tra kỹ hơn. |
| P2 — 3 chỗ animate layout property | ✅ Đã giảm nhẹ | `.app-sidebar` (width) và `.kpi-carousel-dots` (width dot) thêm `contain: layout` để khoanh vùng reflow — không đổi kiến trúc sang transform vì rủi ro lệch layout khi sidebar co giãn ảnh hưởng nội dung bên cạnh. `.dropdown-item` (padding-left hover) đổi hẳn sang `transform: translateX` — an toàn 100%, không có phần phụ thuộc. |
| P2 — 5 easing bounce/elastic | ✅ Đã sửa | Đổi `var(--ease-spring)` / cubic-bezier bounce → `var(--ease-snappy)` (exponential, đã có sẵn trong token, không cần thêm token mới). Xoá luôn `--ease-spring`, `--ease-out-back` (không còn ai dùng). |
| P2 — 4 "side-tab accent border" | ⏸️ Review lại, giữ nguyên | Xem lại từng chỗ: `.risk-alert-bar` (banner "CẦN CAN THIỆP") và `.lt-verdict` (dòng kết luận Leadtime) là mã màu mức độ nghiêm trọng có ý nghĩa thật, khớp icon — pattern chuẩn cho dashboard vận hành, không phải trang trí kiểu AI-slop. Detector không phân biệt được ý định nên vẫn báo, nhưng đây là false positive đã verify. Chỉ có bản ở `.sub-table-container` là thật sự đáng ngờ — và nó đã biến mất cùng với việc xoá CSS chết bên dưới. |
| P3 — CSS chết (`report4-grid`, `sub-table-container`, `sub-table-title`) | ✅ Đã xoá | Đã `grep` xác nhận không JSX nào dùng trước khi xoá. |
| P3 — Contrast `--text-secondary` sát ngưỡng AA | ⏸️ Không đổi | Tính tay: `#64748b` trên nền trắng ≈ 4.76:1 — **đã qua** ngưỡng AA (4.5:1). Đây là token gốc dùng khắp app, đổi màu vì dư 0.26 điểm không đáng risk thị giác toàn app; giữ nguyên. |
| Extract — gom 246 mã hex rời rạc về token | 🟡 Một phần | Đã gom các chỗ **trùng khớp chính xác** với token đã có (`#94a3b8`→`--text-muted`, `#1e293b`/`#334155`/`#e2e8f0`→token tương ứng) ở khu vực `.client-select-option`, `.tab-item-sleek`, `.filter-select-sleek`, `.filter-divider`. Phần còn lại (bảng màu risk-chip đỏ hồng ~15 chỗ, các dòng `mtx-table` all-row/grp-row/sub-row...) là hardcode nhất quán, tự có rule dark-mode riêng, không gây bug — chỉ là chưa DRY. Để dành cho một lượt `/impeccable extract` riêng, làm cẩn thận từng nhóm màu thay vì rewrite hàng loạt trong 1 lần. |

### Lưu ý kỹ thuật quan trọng — tự phát hiện trong lúc sửa

Cách sửa P1 ban đầu (chỉ xoá khối `body.dark-mode { --surface: ...; }` trùng ở
`index.css`) dựa trên giả định sai: tưởng rằng alias `--surface: var(--surface-default)`
khai báo ở `:root` sẽ "tự động" đổi theo mỗi khi `--surface-default` bị override ở
`body.dark-mode`. **Không đúng** — computed value của custom property resolve
(substitute `var()`) ngay tại nơi khai báo, rồi giá trị ĐÃ RESOLVE đó mới được kế
thừa xuống dưới; nó không phải công thức sống tự tính lại. Xoá khối cũ ban đầu làm
`--surface`/`--text-main`/`--border` v.v. đứng im ở giá trị light dù đang bật dark
— đã bắt được lỗi này bằng cách đo `getComputedStyle` qua Browser MCP ngay sau khi
sửa, thay vì tin vào lý thuyết. Sửa đúng: khai báo lại các alias đó trong CÙNG
`body.dark-mode` rule ở `tokens.css` (trỏ vào các token vừa override phía trên
trong chính rule đó), gộp mọi thứ về một nguồn duy nhất mà vẫn hoạt động đúng.
