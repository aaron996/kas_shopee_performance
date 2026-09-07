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
  'self' https://ka-control-tower.vercel.app` — domain thật của Control
  Tower. Trước khi có header này, app không set X-Frame-Options/CSP nào cả
  nên đã nhúng được từ bất kỳ domain nào; thêm header là để giới hạn lại
  đúng domain host, không phải để mở thêm quyền. Nếu Control Tower đổi
  sang domain khác (custom domain riêng) sau này, cần cập nhật lại giá
  trị này.

## 1b. Auto-resize theo chiều cao nội dung (iframe-resizer)

Đã thêm `iframe-resizer` (bản `^4.3`, **MIT** — KHÔNG dùng v5+ vì v5 đổi
sang GPL-3.0/license thương mại, không phù hợp dùng nội bộ công ty) và
import script phía "child" (`src/main.jsx`):

```js
import 'iframe-resizer/js/iframeResizer.contentWindow.min.js';
```

Script này tự chạy, lắng nghe message từ parent và tự báo chiều cao thật
của trang lên mỗi khi content đổi. Vô hại khi app KHÔNG chạy trong iframe
(không có parent để nói chuyện thì nó chỉ ở im).

Phía host (Control Tower) cần cài package `iframe-resizer` tương ứng và
gọi hàm `iframeResizer()` lên chính iframe element sau khi nó load, thay
vì set `min-height` cố định:

```js
import { iframeResizer } from 'iframe-resizer'; // cùng version 4.x, MIT

iframeResizer(
  { checkOrigin: [KAS_ORIGIN], log: false },
  iframeRef.current,
);
```

Nếu host chưa muốn thêm dependency, có thể tạm bỏ qua bước này ở phía host
— script child vẫn build/deploy bình thường, chỉ là height sẽ fallback về
`min-height` CSS cố định cho tới khi host wire nốt phần parent.

## 1c. Đăng nhập Google trong iframe (popup + postMessage)

Vấn đề: Google chặn tuyệt đối trang đăng nhập của họ (`accounts.google.com`)
bị nhúng trong bất kỳ iframe nào (chống clickjacking) — không cấu hình lách
được. Ngoài ra trình duyệt tách riêng vùng lưu trữ cho nội dung nhúng
(storage partitioning), nên đăng nhập ở tab khác cũng không "chảy" session
vào được iframe.

Đã sửa ở app nguồn (repo này) theo hướng: giữ nguyên mô hình auth hiện tại
(Supabase OAuth), chỉ đổi cách trang Google được mở khi app đang chạy
trong iframe — mở ở cửa sổ popup top-level thay vì điều hướng trực tiếp:

- **`src/components/AuthModal.jsx`**: `handleGoogleSignIn` kiểm tra
  `window.self !== window.top`. Nếu đang nhúng, gọi
  `signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true, redirectTo: '<origin>/auth/popup-callback' } })`
  rồi `window.open(data.url, ...)` — trang Google luôn ở cửa sổ tầng trên
  cùng, không bao giờ trong iframe. Nếu không nhúng (mở app trực tiếp),
  giữ nguyên hành vi redirect cũ.
- **`src/components/PopupCallback.jsx`** (mới) + **`src/main.jsx`**: route
  tĩnh `/auth/popup-callback` (không dùng router, chỉ check
  `window.location.pathname`) render component này thay vì `<App />`. Nó
  đọc session vừa tạo (`supabase.auth.getSession()`), gửi về
  `window.opener` qua `postMessage({ type: 'ghn-auth', session }, <cùng origin>)`
  rồi tự đóng cửa sổ.
- **`src/App.jsx`**: thêm listener `message` nhận `type: 'ghn-auth'` (chỉ
  chấp nhận `event.origin === window.location.origin`), gọi
  `supabase.auth.setSession(session)` — session được ghi vào đúng vùng lưu
  trữ của iframe, nên lần sau vào lại không cần đăng nhập lại nữa.
- **`vercel.json`**: đổi `Cross-Origin-Opener-Policy` từ `same-origin`
  sang `same-origin-allow-popups`. **Bắt buộc** — nếu để `same-origin`,
  `window.opener` trong popup sẽ bị trình duyệt cắt đứt ngay khi popup điều
  hướng sang domain khác (Google), khiến `PopupCallback.jsx` không gửi
  session về được.

**Việc cần làm thủ công (ngoài code) trước khi deploy:** thêm
`https://kas-shopee-performance.vercel.app/auth/popup-callback` vào danh
sách **Redirect URLs** được phép trong Supabase Dashboard → Authentication
→ URL Configuration — nếu không, Supabase sẽ từ chối redirect về trang này
sau khi đăng nhập Google xong.

Đánh đổi: người dùng cần đăng nhập lại một lần trong khung nhúng (vùng lưu
trữ của iframe tách riêng khỏi tab ngoài), và cần cho phép popup cho domain
này nếu trình duyệt chặn theo mặc định.

Phía Control Tower (host): không cần thay đổi gì cho phần này — chỉ cần
giữ nguyên `frame-ancestors` đã khai đúng và script `iframe-resizer` như
mục 1b.

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
