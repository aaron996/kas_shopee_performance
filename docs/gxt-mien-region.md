# GXT tách theo Miền (Bắc / Trung / Nam)

Yêu cầu từ chị Quyên: mỗi Miền có **một dòng GXT riêng**, không xếp chung vào vùng
của đơn (trước đây chỉ có `HCM - GXT`, các kho GXT còn lại nằm lẫn trong DNB, DSH,
XBG, TTB, TNG…).

## Kết quả

Ba vùng mới, mỗi vùng thuộc đúng một Miền trong `MIEN_REGIONS`
([defaultDataset.js](../src/data/defaultDataset.js)):

| Miền | Vùng GXT |
|---|---|
| Miền Bắc | `GXT - Bắc` |
| Miền Trung | `GXT - Trung` |
| Miền Nam | `GXT - Nam` |

`HCM - GXT` không còn là vùng; các kho của nó nằm trong `GXT - Nam`. Mọi bảng
(Report 1, bộ lọc Vùng ở Header, command palette, snapshot n8n) tự thấy vùng mới
vì cùng đọc `MIEN_REGIONS`.

## Vì sao Miền suy từ tên kho, không từ `region`

Cột `region` của dòng GXT là **vùng của đơn hàng**, không phải vị trí kho. Đo trên
Supabase (09/10/2026): kho "Tân Tạo - HCM" có dòng ở cả `DSH`, `HNO`, `TTB` và
`HCM - GXT`; 17 dòng pick GXT có `region` rỗng. Gán Miền theo `region` sẽ đưa kho
HCM sang Miền Bắc/Trung.

Tên kho GXT luôn có dạng `Kho Giao Hàng Nặng - <quận/huyện> - <tỉnh>` (hoặc
`… - Hồ Chí Minh`). `reassignGxtMienRegion` ([dataProcessor.js](../src/utils/dataProcessor.js))
lấy tỉnh ở cuối tên và tra Miền trong [provinceMien.js](../src/data/provinceMien.js):

1. Tỉnh ở cuối tên kho → Miền (khớp theo từ, bỏ dấu; có alias `HCM`, `BRVT`, `Huế`).
2. Không nhận ra tỉnh → dùng `region` của dòng (kể cả `HCM - GXT` cũ → Miền Nam).
3. Cả hai đều không ra → giữ nguyên dòng (không đổi vùng).

Kiểm tra trên 57 tỉnh xuất hiện trong data thật (pick/deli/fd, 09/10/2026): đều ra
Miền (Bắc 18, Trung 19, Nam 20); `BRVT` phải thêm alias.

Quy ước Miền khớp `MIEN_REGIONS`: Tây Nguyên và Nam Trung Bộ thuộc Miền Trung. Hai
tỉnh dễ tranh cãi: **Bình Thuận → Trung** (NTB), **Lâm Đồng → Trung** (TNG). Đổi ở
`provinceMien.js` nếu GHN xếp khác.

## Thứ tự và phạm vi áp dụng

`normalizeDashboardRows = reassignGxtMienRegion(reassignKaRegion(rows))`:

- Chạy **sau** `reassignKaRegion`, chỉ đụng dòng còn hub type `GXT`. Kho KA / CK giữ
  nguyên hub type và vùng như trước.
- Dùng ở `App.jsx` và `scopeSnapshotRows` (ảnh snapshot cho n8n).
- **Không** dùng cho báo cáo Telegram HNO (`scopeHnoReportRows`): job đó vẫn lấy
  vùng `HNO` + `HNO - CK` với hub type GXT/BC/CK như cũ, nên số HNO không đổi.
- CA1 không có GXT (`vung_giao` trong Supabase không có GXT), không đổi.

## Ảnh hưởng số liệu

- Dòng GXT rời vùng gốc: DNB, DSH, XBG, TTB, TNG, HNO… **giảm** phần GXT; `GXT - …`
  tăng tương ứng. Tổng toàn quốc và tổng Miền **không đổi** (chỉ đổi cách chia vùng),
  trừ dòng không suy được Miền (bị bộ lọc vùng loại, như trước).
- Phiên đã lưu bộ lọc vùng đầy đủ trước khi có 3 vùng mới được coi là "Tất cả vùng"
  (`NEWER_REGIONS` ở `App.jsx`).

## AI chat

`get_ai_chat_metric` lọc theo `region` thô, trong khi dashboard gửi cho chat danh
sách vùng đang chọn (có `GXT - …`). Migration
[20261009150000_ai_chat_gxt_mien_region.sql](../supabase/migrations/20261009150000_ai_chat_gxt_mien_region.sql)
thêm `public.gxt_mien_region(hub, raw_region)` (cùng quy tắc với `provinceMien.js`:
tỉnh cuối tên kho → fallback `region` → giữ nguyên) và dùng nó cho dòng hub type
GXT trong cả hai nhánh pick/deli. Không có migration này, câu trả lời của chat sẽ
**mất toàn bộ dòng GXT** khi đang chọn đủ vùng.

Danh sách tỉnh trong SQL được sinh từ `provinceMien.js` (khóa đã chuẩn hóa); sửa
một bên thì sửa bên kia.

Giới hạn số vùng trong `screenContext` của chat (`MAX_SCOPE_ITEMS`, trước là 20)
được nới lên 40: dashboard giờ có 21 vùng và gửi cả danh sách khi chọn "Tất cả
vùng", nên giới hạn cũ sẽ trả 400 cho mọi câu hỏi. Có test canh số vùng của
dashboard không vượt giới hạn.

## Chưa làm

- Query BI vẫn tạo `HCM - GXT` ở nguồn; không cần đổi vì app và RPC đã xử lý.
- RPC chat vẫn chưa có logic CK (`HCM - CK` / `HNO - CK`), lệch với dashboard từ
  trước; xem [tech-debt.md](tech-debt.md).

## Kiểm tra

`node --test src/utils/kaRegion.test.mjs src/utils/snapshotView.test.mjs` (có case
Tân Tạo - HCM dưới 4 vùng, `region` rỗng, `HCM - GXT` cũ, KA/CK không bị đụng, và
HNO report giữ GXT ở vùng HNO).
