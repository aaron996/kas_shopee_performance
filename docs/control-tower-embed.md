# Nhúng vào Control Tower (tab "Sức khỏe vận hành")

Ghi chú cho việc nhúng app này (`kas-shopee-performance`, deploy tại
`https://kas-shopee-performance.vercel.app/`) vào tab `tab-ops` của app
Control Tower (host, phụ trách bởi chị Quyên), thay vì build lại UI.

## 1. Những gì đã sửa ở app nguồn (repo này)

- **`src/App.jsx`**: đọc query param `?scope=spb|spe` lúc mount để set
  `clientFilter` ban đầu (khớp toggle SPB/SPE của host) và bỏ qua màn hỏi
  "SPE hay SPB?" khi param hợp lệ đã có sẵn. Ví dụ:
  `https://kas-shopee-performance.vercel.app/?scope=spe`
- **`src/App.jsx`**: thêm listener `window.addEventListener('message', ...)`
  để host có thể đổi scope *sau khi* iframe đã load, không cần set lại
  `iframe.src` (tránh reload toàn bộ app + mất state đang xem):
  ```js
  iframeEl.contentWindow.postMessage(
    { source: 'control-tower', type: 'set-scope', scope: 'SPE' },
    'https://kas-shopee-performance.vercel.app' // targetOrigin — không dùng '*'
  );
  ```
- **`vercel.json`**: thêm header `Content-Security-Policy: frame-ancestors
  'self' https://control-tower.example.com`.
  ⚠️ **PHẢI thay `https://control-tower.example.com` bằng domain thật của
  Control Tower trước khi deploy** — để nguyên placeholder sẽ CHẶN việc
  nhúng từ mọi domain khác `self` (kể cả domain thật của Control Tower).
  Trước khi có header này, app không set X-Frame-Options/CSP nào cả nên đã
  nhúng được từ bất kỳ domain nào — thêm header là để giới hạn lại đúng
  domain host, không phải để mở thêm quyền.

## 2. Chưa có: toggle "Theo ngày / Theo tháng"

App nguồn hiện **chưa có** state global "theo ngày/theo tháng" ở mức app —
chỉ có `clientFilter` (SPB/SPE). Nếu Control Tower cần đồng bộ cả toggle
period, cần làm thêm một trong hai:
- App nguồn tự thêm state `period` (day/month) đọc từ `?period=` + lắng
  nghe thêm `type: 'set-period'` trong message listener ở trên (cùng
  pattern với `scope`), rồi áp state đó vào các report hiện có; hoặc
- Xác nhận với chị Quyên phạm vi period nào đang cần trước khi thêm, vì
  hiện tại các báo cáo (`Report1MienVungHub`, `Report5LaneCa1`) đang tự xử
  lý theo tuần (D-1 vs D-8), không có view "theo tháng" riêng.

## 3. Code phía host (Control Tower, Next.js) — tham khảo

Xem đoạn code React component mẫu được gửi kèm trong nhiệm vụ/PR — không
nằm trong repo này vì Control Tower là một codebase khác mà session này
không có quyền truy cập.
