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

## Chưa làm

- **AI chat**: hàm SQL `get_ai_chat_metric` có logic vùng riêng (chỉ KA, chưa có CK
  hay GXT), vẫn trả `HCM - GXT` / vùng gốc cho GXT. Cần migration riêng nếu muốn
  chatbot khớp dashboard; phần GXT sẽ phải dựng lại việc tra tỉnh trong SQL.
- Query BI vẫn tạo `HCM - GXT` ở nguồn; không cần đổi vì app đã xử lý.

## Kiểm tra

`node --test src/utils/kaRegion.test.mjs src/utils/snapshotView.test.mjs` (có case
Tân Tạo - HCM dưới 4 vùng, `region` rỗng, `HCM - GXT` cũ, KA/CK không bị đụng, và
HNO report giữ GXT ở vùng HNO).
