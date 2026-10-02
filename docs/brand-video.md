# Logo GHN Performance + video intro khi tải dữ liệu

## Logo chốt

Hộp hàng cam `#F15A22` với mũi tên tăng trưởng. Băng keo và mũi tên là **âm bản**
(khoảng trắng), nên logo cần nền trắng. Logo được vẽ lại dạng vector từ ảnh gốc
(176px).

| File | Dùng ở |
|---|---|
| `public/ghn-icon.svg` | Sidebar (`Sidebar.jsx`, trên ô trắng `.sidebar-logo`) |
| `public/ghn-performance-logo.svg` | Lockup đầy đủ; ảnh tĩnh của `BrandSplash` |
| `public/favicon.svg`, `favicon.png`, `apple-touch-icon.png` | `index.html` |

Chữ "GHN" trong lockup là nét vector vẽ tay (chưa phải font gốc của GHN). Nếu có
file logo chính thức thì thay vào `ghn-performance-logo.svg` và `scene.html`.
`public/ghn-logo.png` (logo "GHN Logistics" cũ) không còn dùng.

## Video intro

`public/brand-intro.mp4` + `.webm` (10s, 1280×720, 30fps, ~230KB, nền trắng, không
âm thanh) và `public/brand-intro.meta.json` (`loopStart: 8`, `loopEnd: 10`).

| Giây | Cảnh |
|---|---|
| 0.2–2.1 | Gói hàng chạy theo tuyến về giữa màn hình |
| 1.3–2.8 | Hộp tự lắp (thân, 2 nắp, băng keo) |
| 2.7–3.6 | Mũi tên vẽ ra, tia + vòng sóng |
| 4.5–6.5 | Icon trượt trái, GHN trồi lên, PERFORMANCE giãn chữ |
| 5.8–7.6 | Biểu đồ tăng trưởng vẽ phía dưới, ánh sáng quét icon |
| 8–10 | **Đoạn lặp liền mạch 2s** (vòng xung nhịp + thanh chạy) |

### Dựng lại video

Nguồn nằm ở `tools/brand-video/`. `scene.html` là SVG, mọi thứ là hàm của thời
gian: `window.render(t)` đặt vị trí từng phần tử, nên tua được tới bất kỳ giây nào
(mở `scene.html?t=4.2`).

```bash
npm i --no-save puppeteer-core          # không đưa vào package.json
# cần Chrome/Edge (CHROME_PATH nếu khác mặc định) và ffmpeg (FFMPEG=đường dẫn)
node tools/brand-video/render.mjs            # ~40s: chụp 300 khung rồi ra mp4 + webm
node tools/brand-video/render.mjs --t=7.2    # chỉ xuất 1 ảnh để xem nhanh
```

Lưu ý khi chỉnh `scene.html`:

- Đoạn 8–10s phải **tuần hoàn đúng chu kỳ 2s** (dùng `p = ((t-8)/2) % 1`, độ mờ
  `sin(πp)` để hai đầu bằng 0), nếu không chỗ vòng lặp sẽ giật.
- Nếu đổi mốc lặp, sửa `LOOP_START/LOOP_END` trong `BrandSplash.jsx` và
  `brand-intro.meta.json` (test `brandSplash.test.mjs` đối chiếu hai nơi).
- Encode: H.264 `-crf 24`, keyframe mỗi 1s và đúng giây 8 (tua về đầu đoạn lặp tức
  thì), gắn thẻ màu bt709 để màu cam không lệch (cam sau nén ≈ 238,88,32 so với
  241,90,34).
- Khi "vẽ nét" bằng `pathLength=1`, dùng `stroke-dasharray: 1 2` (không phải `1`),
  vì `1` để lại chấm tròn ở đầu nét với `round` cap.

## `BrandSplash` (`src/components/BrandSplash.jsx`)

Splash toàn màn hình phủ lên lần tải dữ liệu **live đầu tiên của mỗi lần mở/reload
app**. Mục đích của intro là để người dùng có gì đó xem trong lúc chờ số mới, nên
cache IndexedDB (xem [sync-cache.md](sync-cache.md)) **không** làm splash biến mất
sớm: nó chạy cho tới khi sync live xong, hoặc người dùng bấm **Bỏ qua**.

- **Là thứ đầu tiên được vẽ.** `currentUser` được khôi phục đồng bộ từ
  `localStorage` nên `App` mount `<BrandSplash>` ngay ở lần render đầu tiên, phủ
  trắng toàn màn hình (z-index 9999) lên dashboard; không có độ trễ hiện (trước
  đây là 350ms + chờ đọc IndexedDB nên app lọt ra một thoáng). `ready` =
  `liveSyncSettled` (lần sync live đầu tiên đã kết thúc, thành công hay lỗi; hoặc
  tab `dev-admin`); nếu `ready` ngay từ đầu (local preview) thì không hiện.
- **Luôn chạy trọn 10s** (`MIN_SHOW_MS` = độ dài video): sync xong sớm thì intro
  vẫn chạy hết rồi mới mờ; sync lâu hơn thì lặp đoạn 8–10s. Muốn vào sớm, người
  dùng bấm "Bỏ qua".
- **Nút "Bỏ qua →"** ở góc dưới phải (`brand-splash__skip`), hiện mờ dần sau 0.7s
  để không tranh sự chú ý với những khung hình đầu. Bấm thì splash mờ dần ngay;
  app hiện số từ cache nếu có, nếu không thì hiện skeleton của `LoadingScreen`
  trong lúc sync chạy tiếp. Nền nút luôn sáng vì splash luôn trắng.
- Trước khi React mount, `index.html` giữ nền trắng (`html.boot-white`, bật bằng
  script inline nếu có `ghn_user` trong `localStorage`) để không lóe màu xanh
  pastel của app; `main.jsx` gỡ class sau khi splash đã vào DOM.
- Phát tới giây 10 rồi `requestAnimationFrame` tua về giây 8 để lặp tiếp cho đến
  khi dữ liệu về (không dùng thuộc tính `loop` vì chỉ lặp một đoạn).
- `ready` (và đã đủ `MIN_SHOW_MS`) thì mờ dần 0.4s (`LEAVE_MS`) rồi gỡ khỏi DOM.
- Hiện logo tĩnh (`ghn-performance-logo.svg`) khi: `prefers-reduced-motion`,
  autoplay bị chặn, hoặc video lỗi.
- z-index 9999 như `LoadingScreen` cũ; nền luôn trắng kể cả dark mode (là khoảnh
  khắc thương hiệu, không phải bề mặt app).
- Trạng thái chờ trong app dùng chung một skeleton: xem [loading-states.md](loading-states.md).
