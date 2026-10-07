# Cache dữ liệu khi F5 (IndexedDB, stale-while-revalidate)

Code: [`src/utils/syncCache.js`](../src/utils/syncCache.js) · nối vào
[`src/App.jsx`](../src/App.jsx) · test: `src/utils/syncCache.test.mjs`.

## Vấn đề

Trước đây dữ liệu chỉ nằm trong state React (RAM). Mỗi lần F5 app tải lại toàn
bộ snapshot từ Supabase: 5 bảng `kas_*_data`, tổng ~125k dòng. PostgREST giới
hạn 1000 dòng/request nên `fetchAllRows()` (`src/utils/supabaseSheetSync.js`)
phân trang tuần tự: ~150–200 request, mất 10–15s. Hai hệ quả:

- Mở app/F5 nào cũng phải chờ ~10s (và xem hết intro).
- `REQUEST_TIMEOUT_MS = 15000` áp **cho từng trang**. Chỉ cần một trang chậm
  hơn 15s là cả lần sync thất bại, màn hình trống, không có retry.

Sự cố ngày 2026-10-01 (~10:17–10:23 UTC): log API Supabase cho thấy ~150–180
request/phút, trung bình 10–14s/request, tối đa 64s, có lỗi 5xx. Nguyên nhân là
DB quá tải/chậm tại thời điểm đó chứ không phải do UI. Hàm `sync_kas_*_data()`
dùng `delete` + `insert` (không `TRUNCATE`) nên không khóa đọc, và lúc đó không
có job sync nào đang chạy.

## Cách hoạt động

Sau mỗi lần sync **Supabase thành công**, snapshot được lưu vào IndexedDB
(`localStorage` chỉ ~5MB, không đủ; snapshot ~23MB). Khi F5:

1. Ngay khung hình đầu tiên, `BrandSplash` đã phủ lên app (người dùng được khôi
   phục đồng bộ từ `localStorage`, xem [brand-video.md](brand-video.md)).
2. `loadSyncSnapshot(email)` kiểm tra bản ghi `meta` nhỏ (phiên bản, chủ sở hữu,
   tuổi, số dòng) rồi nạp bản ghi `data` (~80ms). Hợp lệ thì vẽ số ngay qua
   `applySupabaseRows(snapshot, 'Bộ nhớ đệm')` và đặt `hasCompletedInitialSync` =
   true, nên app **đã sẵn sàng bên dưới** splash. Splash vẫn chạy tiếp: nó chờ
   `liveSyncSettled` (sync live đầu tiên xong), không chờ cache. Người dùng có thể
   bấm "Bỏ qua" để vào xem ngay số đã lưu.
3. Sync thật chạy song song. Xong thì số tự đổi, nguồn thành `Supabase`, và cache
   được ghi đè (sau 1.5s, ngoài đường găng vì structured clone ~23MB chặn main
   thread). Header chỉ đổi chữ/chấm trạng thái ("Đang đồng bộ dữ liệu"); không còn
   thanh tiến độ hay icon xoay.
4. Không có cache: splash (hoặc nếu đã bỏ qua thì skeleton) ở lại cho tới khi sync
   thật xong.

### Sync lỗi mà số của hôm nay đã có trên màn hình

Nếu lần đồng bộ trước (từ cache hoặc từ sync thật trong phiên) rơi vào **cùng một
ngày theo giờ Việt Nam** (`isSameVietnamDay`, UTC+7) thì sync lỗi **không hiện
toast và banner cảnh báo**: chỉ `console.warn`, trạng thái đặt là `cached` (chip
vẫn có tooltip "đồng bộ gần nhất HH:mm") và tự thử lại ngầm sau 1, 3, 5 phút
(`failQuietlyIfFreshToday` trong `App.jsx`, tối đa 3 lần; reset khi sync thành
công). Nếu số trên màn hình là của ngày hôm qua hoặc không có số thì vẫn cảnh báo
như cũ.

### Quy tắc an toàn

| Quy tắc | Lý do |
|---|---|
| Lưu theo email (không phân biệt hoa/thường), kiểm tra khi đọc | Máy dùng chung không lộ số của người khác |
| `clearSyncSnapshot()` khi đăng xuất và khi `handleResetDefaultData` | Số liệu không sống lâu hơn phiên của chủ nó |
| Tối đa 24h (`SYNC_CACHE_MAX_AGE_MS`); snapshot "từ tương lai" (lệch đồng hồ >5 phút) bị bỏ | Số quá cũ không đáng làm placeholder, khi đó splash ở lại chờ sync thật |
| `SYNC_CACHE_VERSION` | **Tăng khi đổi dạng dòng dữ liệu** để bỏ cache cũ |
| Cache đọc trễ không ghi đè sync thật (`liveSyncDoneRef`) | Tránh số cũ đè số mới |
| Chỉ cache đường Supabase, không cache đường fallback Google Sheet CSV | Fallback thiếu leadtime/FD, sẽ làm hỏng cache |
| Mọi hàm là best-effort, không throw (IndexedDB có thể bị chặn: private window, quota) | Cache hỏng không được làm hỏng app |

### Cấu trúc lưu

DB `kas-sync-cache`, store `snapshots`, 2 key ghi trong cùng một transaction:

- `meta`: `{ version, email, savedAt, updatedAt, counts }`
- `data`: `{ pickData, deliData, ca1Data, leadtimeData, fdData, updatedAt }`, đúng
  dạng thô mà `fetchSupabaseSheetSync()` trả về (trước `normalizeRows`).

### Số đo (Edge, 124k dòng, 23MB JSON)

Lưu 88ms · probe 1ms · nạp 77ms.

### Điểm cần biết

- Lần F5 đầu tiên sau khi deploy chưa có cache nên vẫn chờ và xem intro.
- Cột "Nguồn" khi xuất báo cáo ghi `Bộ nhớ đệm` nếu xuất trước khi sync xong.
- Khi sync lỗi nhưng đang hiển thị số từ cache, banner nói đó là "bản đã lưu từ
  lần tải trước".

## Việc chưa làm (chữa gốc)

Cache chỉ che độ trễ, không giảm tải DB. Luồng đọc đã được tối ưu thêm ngày
07/10/2026 bằng phân trang theo khóa chính `id` trong
`src/utils/supabaseTableReader.js`: mỗi trang dùng `id > cursor`, tránh việc
OFFSET đọc lại toàn bộ dòng ở các trang trước. Hai probe nhỏ đầu/cuối bảng
kiểm tra lượt tải có bị job sync thay dữ liệu giữa chừng hay không. Số request
và dung lượng toàn bộ snapshot chưa giảm; KPI vẫn nhận đủ dữ liệu như trước.

Đo `EXPLAIN (ANALYZE, BUFFERS)` trực tiếp trên DB, truy vấn Pickup lấy cùng
1.000 dòng tại offset 27.000:

| Cách đọc | Dòng tại node Index Scan | Shared buffers | Execution time |
|---|---:|---:|---:|
| OFFSET 27.000 | 28.000 | 618 | 7,251 ms |
| `id > cursor AND id <= last_id` | 1.000 | 28 | 0,524 ms |

Đây là một phép đo SQL trên dữ liệu và cache DB tại thời điểm kiểm tra,
không bao gồm mạng, REST/RLS của phiên người dùng, parse JSON hay render UI.
Test fixture kiểm tra giữ đủ dòng/cột, API cap nhỏ hơn page size, ID đứt quãng,
bigint dạng chuỗi, đổi snapshot, lỗi trang và hủy timeout; chưa đo thời gian
tải app qua phiên đăng nhập live.

Hướng giảm tiếp số request và dữ liệu truyền nên làm riêng:

- Gộp 150–200 request thành 1–2 request nén (Edge Function, hoặc file snapshot
  trên Storage/CDN do Apps Script sinh ra sau mỗi lần sync).
- Retry từng trang với backoff, và tính timeout trên tổng thay vì từng trang.
