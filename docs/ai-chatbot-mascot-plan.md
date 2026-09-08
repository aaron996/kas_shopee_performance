# Plan: Chatbot AI + Mascot 2D cho GHN KAS Dashboard

> Trạng thái: PLAN — chưa code. Viết sau khi đọc repo thực tế (React 19 + Vite 8,
> Supabase auth, deploy Vercel với CSP chặt, GSAP 3.15 đã cài kèm `gsapSetup.js`).
> Số model/giá ở mục 10 tra từ reference chính thức, không nhớ từ đầu.

## 0. Quyết định đã chốt

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Scope bot | Hỏi-đáp trên data đang load **+** hướng dẫn dùng dashboard | Không cần DB mới, không cần quyền warehouse |
| Backend | Vercel Serverless Function `/api/chat` | Cùng origin → **không phải sửa CSP**, deploy chung 1 lần với app |
| Mascot | Inline SVG + GSAP | 0 dependency mới, 0 asset ngoài → CSP-safe, điều khiển state tự do |
| Model | `claude-opus-5` (mặc định) | Xem mục 10 — hạ model là quyết định của Vinh, không phải mặc định của plan |
| Tool execution | Chạy ở **client**, không phải server | Xem mục 1 — data sống trong RAM của browser |

## 1. Kiến trúc — điểm quan trọng nhất: tool chạy ở CLIENT

Đây là quyết định định hình cả plan, nên nói trước.

Data của app (`pickRows`, `deliRows`, `ca1Rows`, `leadtimeRows`) sống trong React state
của browser, sync từ Supabase/Google Sheet lúc load. Serverless function **không có**
data đó. Hai cách xử lý:

- Server tự query Supabase lại → nhân đôi logic filter/aggregate đã có trong
  `dataProcessor.js` + `leadtimeCalc.js`, và bot sẽ trả lời trên tập data **khác** với
  cái Vinh đang nhìn trên màn hình. Sai lệch kiểu này rất khó debug và làm mất tin tưởng.
- Tool chạy ở client. Server chỉ là proxy giữ API key. **Chọn cái này.**

Vòng lặp:

```
Browser                         /api/chat (Vercel)          Claude API
  |  POST {messages, tools}  ------->  verify JWT
  |                                    + inject system   --------->
  |  <---- SSE stream --------------------------------------------  text / tool_use
  |
  |  stop_reason === "tool_use"?
  |    +-> chay tool NGAY TRONG BROWSER (doc pickRows/deliRows/leadtimeIndex)
  |    +-> POST lai /api/chat kem tool_result
  v
render
```

Hệ quả: **không** dùng `client.beta.messages.tool_runner` — helper đó chạy vòng lặp
server-side, không chạm được RAM browser. Viết manual loop ở client (`while stop_reason
=== 'tool_use'`), server stateless hoàn toàn.

## 2. Phase 0 — Spike 0.5 ngày, 3 thứ phải verify trước khi build gì cả

Ba cái này mà sai thì kiến trúc mục 1 phải làm lại, nên làm trước.

1. **`vercel.json` có ăn mất `/api/chat` không.** Hiện có catch-all
   `{"source": "/(.*)", "destination": "/index.html"}`. Theo thứ tự routing của
   Vercel, `rewrites` trong `vercel.json` hành xử như `afterFiles` — tức filesystem
   (bao gồm serverless function trong `api/`) được check TRƯỚC, nên về lý thuyết
   `/api/chat` vẫn tới function. **Phải test thật, đừng tin lý thuyết**: deploy một
   function `api/ping.js` trả `{ok:true}` lên preview rồi `curl` nó.
   Nếu bị catch-all ăn → sửa source thành negative lookahead:
   `"source": "/((?!api/).*)"`.
2. **Streaming SSE qua Vercel.** Function phải trả `text/event-stream` và không bị
   buffer. Test bằng function đếm 1→5 mỗi 500ms, xem browser nhận từng chunk hay
   nhận một cục sau 2.5s.
3. **CSP.** `connect-src 'self'` đã cho phép `/api/chat` → không cần sửa
   `vercel.json` headers. Verify bằng cách xem Console không có CSP violation.
   Đây chính là lý do chọn Vercel thay Supabase Edge Function (cái kia phải thêm domain).

4. **Max duration của Vercel function.** Một lượt chat Opus 5 có adaptive thinking +
   tool loop có thể mất 15-30s. Giới hạn thời gian chạy function khác nhau theo plan
   (Hobby thấp hơn Pro đáng kể) và nếu bị cắt giữa stream thì user thấy câu trả lời
   đứt ngang — trông như bug chứ không như timeout. Phải tra giới hạn thực tế của
   plan Vercel đang dùng, rồi test bằng một prompt cố tình dài (bắt bot gọi 3-4 vòng
   tool). Nếu không đủ: hoặc nâng `maxDuration` trong config function, hoặc hạ
   `effort`/`max_tokens`, hoặc chuyển sang Edge runtime (streaming không bị cap
   duration nhưng không chạy được Node SDK — phải dùng fetch thẳng, cân nhắc kỹ).

Nếu (2) thất bại → fallback là non-streaming (`messages.create`) + mascot state
"đang nghĩ", chấp nhận chờ 3-8s. UX kém hơn nhưng không chặn dự án.

## 3. Backend `api/chat.js`

```
api/
  chat.js        # POST — proxy streaming toi Claude API
  _auth.js       # verify Supabase JWT + allowlist email
  _ratelimit.js  # dem luot theo email, luu Supabase
```

Dependency mới: `@anthropic-ai/sdk`. Dùng SDK chính thức, không tự `fetch` thẳng.

### Model & tham số

```js
// api/chat.js
const stream = client.messages.stream({
  model: 'claude-opus-5',
  max_tokens: 8192,
  thinking: { type: 'adaptive' },        // Opus 5 bat thinking mac dinh
  output_config: { effort: 'low' },      // chat khong huong loi tu effort cao
  system: [ /* xem layout cache ben duoi */ ],
  tools: TOOLS,                          // strict: true, xem muc 5
  messages,
});
```

Ghi chú kỹ thuật (dễ sai nếu làm theo trí nhớ):

- **Không** truyền `budget_tokens` — Opus 5 trả 400. Dùng `output_config.effort`.
- **Không** dùng assistant prefill — Opus 5 trả 400. Cần ép format thì dùng
  `output_config.format` (structured outputs).
- `effort: 'low'` là chủ ý: chat/Q&A không phải workload hưởng lợi từ effort cao;
  nâng lên `medium` chỉ khi đo được câu trả lời sai/nông ở `low`.
- Parse `tool_use.input` bằng `JSON.parse`, **không** string-match.
- Nhiều `tool_use` trong một assistant message là bình thường → chạy song song rồi
  gửi **tất cả** `tool_result` trong **MỘT** user message. Tách ra nhiều message sẽ
  âm thầm dạy model bỏ parallel tool use.
- Dùng type của SDK (`Anthropic.MessageParam`, `Anthropic.Tool`), đừng tự khai
  `interface ChatMessage`.
- Error handling: chain từ hẹp đến rộng — `RateLimitError` → `APIStatusError` →
  `APIConnectionError`. Một `catch (e)` chung sẽ trộn lẫn lỗi retry được và không.

### Layout prompt caching (quan trọng cho chi phí)

Cache là **prefix match** — đổi một byte ở đầu là mất cache toàn bộ phía sau. Thứ tự
render là `tools` → `system` → `messages`. Nên:

```
[on dinh, cache_control: ephemeral]
  tools (thu tu co dinh, khong sort dong)
  system: persona + rule + metricGlossary (muc 6)
--------- breakpoint ---------
[bien dong, KHONG cache]
  messages: history + data brief (muc 4) + cau hoi
```

Sai kinh điển cần tránh: nhét `new Date()`, tên user, hay data brief vào `system`.
Làm vậy là mỗi request cache miss 100%. Verify bằng `usage.cache_read_input_tokens`
— nếu nó bằng 0 qua nhiều request liên tiếp thì có invalidator ẩn.

Bonus dùng được vì đã chọn Opus 5: **mid-conversation system message** (append
`{role:'system', content:...}` vào `messages`, không cần beta header). Dùng để bơm
"user vừa đổi sang tab Leadtime, client SPE" giữa hội thoại mà không phá cache
prefix. Không hợp lệ ở `messages[0]`, phải đứng sau một user message.

### Auth

Client gửi `Authorization: Bearer <supabase access_token>`. Server:

1. Verify token qua `supabase.auth.getUser(token)` (anon key là đủ, Supabase tự
   verify signature).
2. Check email nằm trong allowlist. Vấn đề: `isAllowedEmail` hiện nằm trong
   `src/components/AuthModal.jsx` — component React, không import sạch sẽ vào
   serverless function được. **Refactor nhỏ**: tách sang `src/utils/authPolicy.js`,
   `AuthModal.jsx` và `api/_auth.js` cùng import. Đây là thay đổi duy nhất plan này
   đụng vào code auth hiện có.
3. Không tin `localStorage`/body của client cho bất cứ thứ gì về quyền — cùng lý do
   `App.jsx:77` đã cẩn thận với `isDevAdmin`.

### Rate limit

Serverless stateless nên không giữ counter trong RAM. Bảng Supabase mới:

```sql
create table ai_chat_usage (
  id bigserial primary key,
  email text not null,
  created_at timestamptz not null default now(),
  input_tokens int, output_tokens int, model text,
  tool_names text[]        -- metadata, KHONG luu noi dung cau hoi
);
create index on ai_chat_usage (email, created_at desc);
```

RLS: khoá đọc như migration `20260813_lock_dev_admin_access_logs.sql` đã làm; ghi
bằng service-role key từ server. Hạn mức đề xuất: 60 lượt/user/ngày + 600 lượt/toàn
org/ngày, trả 429 kèm message tiếng Việt để mascot hiển thị được ("Hôm nay mình hết
lượt rồi").

## 4. Context builder — `src/utils/chatContext.js`

Không được dump raw rows vào prompt: pick/deli là hub-level x nhiều ngày, dễ vài trăm
nghìn token. Thay vào đó build **data brief** đã pre-aggregate, tái dùng đúng những
hàm đã có và đã test:

| Nguồn | Dùng lại từ |
|---|---|
| KPI D-1 vs D-8, delta | `computeKpiDeltas` (`insightAnalysis.js:119`) |
| Vùng/hub đáng lo | `buildAttentionList` (`insightAnalysis.js:78`) |
| Tín hiệu leadtime | `buildLeadtimeSignal` (`insightAnalysis.js:141`) |
| Câu chuyện "vì sao đổi" | `buildNarrative` (`insightAnalysis.js:182`) |
| Tóm tắt điều hành | `generateExecutiveSummary` (`dataProcessor.js:162`) |
| Phạm vi ngày có data | `dataCoverage` (`dashboardState.js:23`) |

Cộng thêm **view state**: tab đang mở, `clientFilter`, `selectedRegions`, `density`.
Bot phải biết Vinh đang nhìn gì mới trả lời đúng ngữ cảnh.

Hai quy tắc cứng:

1. **Field allowlist, không dùng denylist.** Brief chỉ được chứa các cột liệt kê
   tường minh. Denylist kiểu "bỏ cột nào có chữ phone" sẽ rò khi nguồn Sheet thêm cột
   mới. Pick/deli hiện là aggregate theo hub nên không có PII, nhưng nguồn là Google
   Sheet do người khác sửa được — không đặt cược vào việc nó mãi như vậy.
2. **Ngân sách token đo được, không đoán.** Target brief <= 2.000 token. Viết
   `src/utils/chatContext.test.mjs` (đúng pattern `npm test` hiện có: `node --test
   src/utils/*.test.mjs`) assert độ dài brief dưới ngưỡng, để nó không âm thầm phình
   ra khi thêm field.

## 5. Tools — chạy ở client (`src/utils/chatTools.js`)

| Tool | Làm gì | Đọc từ | Ghi chú |
|---|---|---|---|
| `get_metric_table` | KPI theo miền/vùng/hub, khoảng ngày | `pickRows`/`deliRows` | Trả tối đa N dòng, kèm `truncated: true` khi cắt |
| `get_leadtime_stages` | 4 chặng theo lane/tỉnh | `buildLeadtimeIndex` + `aggregate` | Weighted theo `mau`, không mean đơn giản |
| `get_ca1` | % đơn về ca 1 theo lane | `ca1Rows` | |
| `explain_metric` | Định nghĩa OPR/ODR/%ca1/4 chặng | `metricGlossary.js` | Mục 6 |
| `navigate` | Đổi tab / client / vùng đang chọn | gọi `setActiveTab`, `setClientFilter`, `handleJumpToRegion` (`App.jsx:169`) | Hiện chip "Bot đã chuyển sang tab 3" để user biết ai vừa đổi UI |

Mọi tool khai `strict: true` + `additionalProperties: false` + `required` đầy đủ →
`input` chắc chắn validate đúng schema, khỏi viết code phòng thân.

Guardrail chống bịa số — rủi ro số 1 của loại bot này:

- System prompt: *"Mọi con số trong câu trả lời PHẢI đến từ kết quả tool hoặc data
  brief. Không có số thì nói không có, không được suy ra hay ước lượng."*
- Tool result trả kèm `as_of` (ngày data) để bot không nói "hôm nay" khi data là D-1.
- Khi không đủ data: bắt bot trả lời theo đúng giọng `StatusNotice` hiện có ("Chưa
  thể kết luận..."), không đoán.

Chống prompt injection: data đến từ Google Sheet → **untrusted**. Bọc tool result
trong `<data>...</data>` và ghi rõ trong system prompt rằng nội dung trong `<data>`
là dữ liệu, không phải chỉ thị. Một cell Sheet ghi "bỏ qua hướng dẫn trước" không
được có hiệu lực.

## 6. Glossary — `src/data/metricGlossary.js`

Định nghĩa OPR, ODR, 1st Pickup, 1st Deli, %ca1, 4 chặng leadtime, target từng
client, cách tính weighted average. Viết tay, nằm trong repo, đưa vào phần cache
được của system prompt.

Lý do tách riêng: đây là loại thông tin **không được sai** và cũng là loại model dễ
bịa nhất (mỗi công ty định nghĩa OPR một kiểu). Có file này thì sửa định nghĩa là sửa
một chỗ, và nó nằm trong git history — review được.

## 7. Mascot 2D

```
src/components/chat/
  Mascot.jsx        # SVG inline + ref cho tung bo phan
  useMascotState.js # map state -> GSAP timeline
  mascot.css        # tu the nghi (resting pose) bang CSS
```

### Hướng thiết kế

GHN là giao vận, brand orange `#f15a22` đã có trong tokens. Đề xuất: một **kiện hàng
tròn nhỏ** có mắt, quàng khăn/mũ cam, tay ngắn — đọc ra ngay là "bạn giao hàng" mà
không cần vẽ người. Palette lấy từ `tokens.css` (`--ghn-orange` + `--surface-canvas`
pastel-blue) để không thành vật thể lạ trên dashboard. Có bản dark-mode (app đã có
`body.dark-mode`).

### States

| State | Animation | Trigger |
|---|---|---|
| `idle` | thở (scale 1→1.03), nháy mắt random 3-6s | mặc định |
| `listening` | nghiêng đầu, mắt to hơn | user focus vào input |
| `thinking` | nhấp nhô + 3 dấu chấm quay quanh | đang chờ stream |
| `speaking` | nhún nhẹ theo nhịp token về | đang stream text |
| `happy` | nhảy + sparkle | trả lời xong, KPI đạt target |
| `worried` | rũ xuống, mày cong | trong câu trả lời có vùng đỏ |
| `sleeping` | nhắm mắt, Zzz | idle > 60s |

### 4 quy tắc GSAP bắt buộc (rút từ chính comment trong `gsapSetup.js`)

1. **Chỉ dùng `gsap.to()`, không bao giờ `gsap.from()`/`fromTo()` cho mascot.**
   `gsap.from()` ghi trạng thái ĐẦU (opacity 0) vào inline style ngay lập tức, còn
   trạng thái cuối phải chờ rAF tick. Tab ẩn → không có tick → mascot đứng ở opacity 0,
   tức là **biến mất**. Bug này đã xảy ra thật với 5 khối của tab Leadtime (xem
   docblock `shouldAnimate` trong `gsapSetup.js`). Tư thế nghỉ đặt trong CSS, GSAP chỉ
   animate từ đó đi.
2. **Đi qua `runAnimation()`**, không gọi `gsap` trực tiếp → tự tôn trọng
   `prefers-reduced-motion` + `document.hidden`, tự revert khi unmount.
3. **Reduce-motion phải ra mascot TĨNH nhưng ĐẦY ĐỦ**, không phải mascot mất tích.
   Đây là hệ quả trực tiếp của (1).
4. **Pause khi không thấy.** Idle loop chạy rAF vô hạn → `timeline.pause()` khi panel
   đóng và trên `visibilitychange`. `will-change` chỉ set trong lúc đang animate, bỏ
   ngay sau đó.

Accessibility: mascot là trang trí → `aria-hidden="true"`. Đổi state **không** thông
báo cho screen reader; thông tin thật đi qua live region của khung chat.

## 8. Chat UI

```
src/components/chat/
  ChatLauncher.jsx  # FAB + mascot thu nho
  ChatPanel.jsx     # panel hoi thoai
  ChatMessage.jsx   # 1 bong bong
  useChat.js        # state + vong lap tool (muc 1)
  chat.css
```

### Xung đột layout đã kiểm tra trong `index.css`

- `.home-fab` đã chiếm `bottom: 2rem; right: 2rem` (`index.css:1731`) → FAB chat phải
  lệch: đề xuất `bottom: 5.5rem` trên desktop.
- `<=768px` có `.mobile-bottom-nav` → mobile đặt FAB phía trên bottom nav, tham chiếu
  cách `.toast-viewport` đã xử lý (`index.css:4326`).
- Thang z-index hiện tại: `.home-fab` auto - `.toast-viewport` 1200 -
  `.sync-progress-bar` 1300 - `.cmdk-backdrop` 1400 - `.fullscreen-mode-active` 1500 -
  `.dropdown-menu` 2000 - modal overlay 10000.
  → Chat FAB + panel đặt **1100**: dưới toast (toast vẫn phải đọc được), dưới Command
  Palette, dưới modal. Và ẩn FAB khi `.fullscreen-mode-active` đang bật.
- Print CSS (`index.css:2781`) đã ẩn `.home-fab` → thêm chat vào cùng danh sách đó.

### Embed mode

App được nhúng iframe trong Control Tower (`docs/control-tower-embed.md`,
`frame-ancestors` trong CSP). Trong iframe, host có thể có chat riêng → **ẩn FAB khi
`window.self !== window.top`**, cho host bật lại qua `postMessage` nếu muốn (dùng lại
listener `message` đã có trong `App.jsx`).

### Render câu trả lời

Bot trả markdown. **Không** thêm markdown renderer nặng và **không** dùng
`innerHTML`. Chỉ hỗ trợ subset tự parse: bold, list, inline code, bảng đơn giản —
render bằng React element, không dựng HTML string. CSP `script-src 'self'` không cứu
được XSS qua `innerHTML` vì đó không phải script.

## 9. Checklist bảo mật & quyền riêng tư

- [ ] `ANTHROPIC_API_KEY` chỉ nằm trong Vercel env, không bao giờ trong client bundle
- [ ] `/api/chat` verify Supabase JWT thật, không tin body
- [ ] Rate limit theo email + theo org
- [ ] Field allowlist ở context builder (mục 4)
- [ ] Tool result bọc `<data>`, system prompt tuyên bố đó là data
- [ ] Log **chỉ** metadata (email, token, latency, tool). Nội dung câu hỏi: không log
      mặc định; muốn debug thì bật opt-in có thời hạn
- [ ] Không gửi email user vào prompt (chỉ dùng để rate-limit)
- [ ] `navigate` tool chỉ đổi UI, không được gọi tool nào có side effect ra ngoài
      (không gửi mail, không ghi DB, không export)

## 10. Chi phí

Giá API (tính trên 1M token):

| Model | Input | Output |
|---|---|---|
| `claude-opus-5` | $5 | $25 |
| `claude-sonnet-5` | $2 | $10 |
| `claude-haiku-4-5` | $1 | $5 |

Ước tính một lượt hỏi. Giả định: system + tools + glossary ~4k token **được cache**,
brief ~2k token không cache, output ~600 token, trung bình 2 lần gọi API vì có tool
loop:

| Model | ~$/lượt | 50 lượt/ngày → ~$/tháng |
|---|---|---|
| `claude-opus-5` | ~$0.05 | ~$75 |
| `claude-sonnet-5` | ~$0.02 | ~$30 |
| `claude-haiku-4-5` | ~$0.01 | ~$15 |

Plan mặc định `claude-opus-5`. Cache read rẻ khoảng 10x so với giá input nên phần
system prompt gần như miễn phí từ lượt 2 — đó là lý do mục 3 làm layout cache cẩn
thận. Nếu Vinh muốn đổi sang Sonnet 5 để rẻ hơn ~2.5x thì đổi một dòng `model:`; đó
là lựa chọn của Vinh, plan không tự hạ.

## 11. Lộ trình

| Phase | Việc | Ngày |
|---|---|---|
| 0 | Spike: verify rewrite / streaming / CSP (mục 2) | 0.5 |
| 1 | `api/chat.js` + auth + rate limit + tách `authPolicy.js` | 2 |
| 2 | Chat UI shell + render streaming + z-index/layout | 2 |
| 3 | `chatContext.js` + `metricGlossary.js` + test ngân sách token | 2 |
| 4 | Tool loop client-side + `navigate` + guardrail chống bịa số | 3 |
| 5 | Mascot SVG + 7 state GSAP + dark mode + reduce-motion | 3 |
| 6 | Polish: a11y, perf, print CSS, embed mode, eval | 2 |
| | **Tổng** | **~14.5 ngày làm việc** |

Phase 1 và 2 độc lập nhau, làm song song được nếu có 2 người. Phase 5 (mascot) độc
lập hoàn toàn với 1-4 — giao người khác được.

## 12. Định nghĩa "xong"

- `npm test` xanh, có thêm `chatContext.test.mjs` (ngân sách token) và
  `chatTools.test.mjs` (tool trả đúng số với dataset mẫu)
- Eval tay 20 câu hỏi thật: 10 câu có đáp án số kiểm chứng được bằng tab tương ứng,
  5 câu về định nghĩa chỉ số, 5 câu bot **phải** từ chối trả lời (data không có).
  Bar: 0 câu bịa số. Đây là tiêu chí đi/không đi, không phải "nice to have".
- Bật `prefers-reduced-motion` → mascot tĩnh, vẫn nhìn thấy, không tween nào chạy
- Mở app trong tab ẩn rồi switch sang → mascot hiện đúng, không mất
- Bundle chính không tăng > 30KB gzip (chat + mascot lazy-load, cùng pattern `lazy()`
  mà tab Leadtime/Insight đang dùng)

## 13. Cố tình KHÔNG làm ở v1

- **Text-to-SQL** — cần quyền warehouse + guardrail query nặng + review bảo mật. Là
  dự án riêng, không phải phần của cái này.
- **Bot tự gửi Zalo/Telegram** — outbound message cần luồng xác nhận riêng.
- **Lịch sử hội thoại lưu server** — v1 giữ trong `sessionStorage`, mất khi đóng tab.
  Muốn lưu thì phải quyết định thời hạn giữ và ai đọc được, chưa cần bàn ở v1.
- **Voice** — chưa có nhu cầu rõ.
