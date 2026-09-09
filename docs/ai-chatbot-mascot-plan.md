# Plan: Chatbot Luna + Mascot 2D cho GHN KAS Dashboard

> Cập nhật 08/09/2026 theo review và quyết định của Vinh: Luna trả lời chatbot
> trong app, backend đọc trực tiếp database. Trạng thái: Task 1 đã code local;
> migration đã áp dụng Supabase ngày 08/09/2026. Key/API, SQL parity và Luna
> streaming đã kiểm tra riêng; full endpoint với JWT người dùng và deploy còn chờ.

### Kết quả smoke test 08/09/2026

- Env đầy đủ tại `D:/Github/GHN/.env.local`; script đọc trực tiếp file này.
- Migration `create_ai_chat_backend` đã áp dụng trên project `iyjsihwgnzcytbojvoom`.
- RPC chạy với role authenticated: ODR SPB toàn quốc 07/09/2026 = 92,06%,
  tử số 92.047 và mẫu 99.988, khớp SQL trực tiếp.
- Anonymous gọi RPC bị từ chối với mã 42501. Authenticated không có quyền
  execute reserve/finalize; bốn RPC dữ liệu là SECURITY INVOKER.
- Reserve/finalize được test trong transaction rollback: reserved về 0,
  used ghi đúng 8 microUSD cho cả user và org. Không lưu quota test giả.
- `scripts/chat-smoke.mjs`: Luna thật chọn metric tool và stream đúng kết quả
  từ fixture đã đối chiếu SQL; 3 model calls, chi phí ước tính 857 microUSD.
  Đây chưa phải E2E: tool được thay bằng fixture, chưa có JWT user cho HTTP endpoint.
- Supabase advisors: ba bảng quota/usage có RLS không policy là chủ đích
  service-role-only; có cảnh báo Auth leaked-password protection hiện đang tắt.
- Giữ flag trong file env là false; script chỉ bật trong process smoke test.
> Repo đã đối chiếu: React 19, Vite 8, Supabase auth/data, Vercel, GSAP 3.15.
> Schema/quyền DB live, model access và hiệu năng còn phải kiểm chứng ở Phase 0.

## 0. Quyết định triển khai

| Thành phần | Quyết định |
|---|---|
| Nhiệm vụ | Hỏi đáp số liệu vận hành trong DB và hướng dẫn dùng dashboard |
| Model trong app | OpenAI `gpt-5.6-luna`, `reasoning.effort: low` khởi đầu |
| API | SDK `openai`, Responses API, API key riêng trên backend |
| Backend | Vercel Node.js Function `/api/chat`, cùng origin |
| Nguồn v1 | Bốn bảng KAS trong Supabase hiện có |
| Tool execution | Toàn bộ tool đọc DB và vòng gọi model chạy trên server |
| Query scope | Theo câu hỏi/hội thoại và quyền truy cập, độc lập bộ lọc UI |
| Mascot | PNG nền trong suốt + GSAP trên một pivot cố định, năm state cốt lõi |
| History | Bản đọc trong sessionStorage theo user, không lưu nội dung vào DB v1 |
| DB bổ sung | Metadata quota/usage và RPC đọc có tham số cố định |

Luna là model chatbot trong sản phẩm, không phải yêu cầu thay model Codex đang
phát triển. Giữ Luna trong toàn bộ v1; không tự route sang model đắt hơn khi lỗi
hoặc chất lượng chưa đạt. Tối ưu prompt, tools và effort trên Luna trước.

## 1. Kiến trúc: backend truy vấn DB

```text
Browser: câu hỏi + history text giới hạn + requestId
    |
    | POST /api/chat + Supabase access token
    v
Vercel: verify JWT -> kiểm tra quyền -> reserve quota
    |
    +-> Luna chọn function + arguments
    |       |
    |       v
    |   Server validate -> RPC/query cố định -> Supabase KAS
    |       |
    |       v
    |   Số đã tổng hợp + phạm vi + ngày dữ liệu + nguồn
    |       |
    +-------+-> Luna diễn giải; tối đa 3 vòng tool
    |
    v
SSE: trạng thái / text / nguồn / hoàn tất hoặc lỗi
    |
    v
ChatPanel + mascot
```

Browser không gửi raw rows, data brief, ảnh màn hình hoặc kết quả tool. Backend
không đọc DOM hay rows trong React state. DB mới hơn bản dashboard đang load thì
chatbot dùng DB và ghi thời điểm đồng bộ. Đọc trực tiếp DB vẫn là đọc snapshot
đồng bộ từ Sheet, không đồng nghĩa dữ liệu realtime warehouse.

Server chạy truy vấn được lập trình và review. Luna chọn client/ngày/vùng/lane
trong schema cho phép; không có tool nhận SQL, tên bảng/cột tự do. Vòng tool nằm
trong một HTTP request server; không có continuation tool qua browser.

### Request và history

- Chỉ nhận `question`, `history`, `requestId`. Câu hỏi tối đa 4.000 ký tự;
  history tối đa 10 cặp hỏi/đáp hoàn tất, text role user/assistant; body <=64 KiB.
  Server validate cấu trúc, tổng token và từ chối unknown fields.
- Không nhận model, instructions, system/developer, tools, SQL, raw data,
  function outputs hoặc provider response ID từ client.
- History browser là untrusted, chỉ giúp hiểu câu nối tiếp. Server đóng gói thành
  dữ liệu hội thoại giới hạn, không forward input provider tùy ý. Số liệu trong
  history không là bằng chứng: câu trả lời số phải có evidence DB của lượt hiện tại.
- Unique user/requestId và payload hash trong metadata: claim một lần. Request
  trùng đang chạy trả 409; cùng ID nhưng body khác bị từ chối. Đứt mạng báo gián
  đoạn, user chủ động gửi lượt mới; không tự phát lại request có thể đã tính phí.
- History đầy thì bắt đầu hội thoại mới. Logout/hết session hủy request và xóa
  history đang dùng; storage key theo user ID, tránh lộ cho tài khoản kế tiếp.

## 2. Data source và query scope

Theo `src/utils/supabaseSheetSync.js` và `docs/google-sheet-supabase-sync.md`,
Google Sheet được Apps Script đồng bộ vào các bảng dưới đây. Đây là bằng chứng
repo; Phase 0 phải kiểm tra schema/quyền live trước implementation.

| Bảng | Mục đích | Quy tắc |
|---|---|---|
| `kas_pick_data` | 1st Pickup, OPR, pickup volume | Map tử/mẫu, chuẩn hóa vùng/hub như app |
| `kas_deli_data` | 1st Delivery, ODR, delivery volume | Giữ mẫu số/grain theo metric |
| `kas_ca1_data` | % về ca 1 theo lane/vùng | Không giả định nguồn tách SPB/SPE; UI hiện không phân client |
| `kas_leadtime_data` | Bốn chặng, E2E, lane/cặp tỉnh | Weighted theo mau, NULL riêng từng chặng |

Không truy vấn auth, access logs, quota hoặc bảng ứng dụng khác bằng chatbot tools.

`QueryScope` do server chuẩn hóa từ hội thoại: client, dateFrom/dateTo, regions,
hubTypes, lane, provincePair, grain. Không copy activeTab/clientFilter/selectedRegions
hay bộ lọc riêng của Leadtime từ màn hình.

- Thiếu client mà ảnh hưởng câu trả lời: hỏi rõ SPB/SPE/tất cả. Scope đã nói trong
  chat dùng cho câu nối tiếp; không đoán theo tab đang mở.
- “Mới nhất” lấy ngày có dữ liệu của nguồn đang hỏi. “Hôm nay/hôm qua” theo
  Asia/Ho_Chi_Minh; thiếu ngày đó thì báo thiếu, không tự chuyển sang ngày khác.
- Ca 1 hỏi riêng client mà nguồn không hỗ trợ: nói rõ giới hạn.
- Vượt coverage lịch sử DB thì báo thiếu; không điền số từ history. V1 tối đa 90
  ngày/query; yêu cầu lớn hơn cần thu hẹp.
- Nếu sau này có nút “Dùng bộ lọc đang xem”, phải là thao tác chủ động và có adapter
  đầy đủ cho từng report; nằm ngoài v1.

### Độ tươi và snapshot

Result có `source`, `queriedAt`, `dataAsOf`, `syncedAt`, `scope`,
`coverage`, `truncated`, `evidenceId`. DataAsOf là ngày nghiệp vụ, syncedAt là
thời điểm đồng bộ; không dùng timestamp mới nhất của một bảng cho mọi nguồn.
Bảng lỗi, bảng rỗng và kỳ không có dữ liệu phải trả trạng thái khác nhau.

Full refresh hiện chạy từng bảng, không đảm bảo cả bốn bảng cùng batch. Mỗi query
tổng hợp cần snapshot trong một statement/transaction. So sánh đa nguồn phải trả
coverage/timestamp từng bảng; khác kỳ thì không kết luận so sánh tương đương.
Giữa các vòng tool kiểm tra sync version: nguồn đã đổi thì hủy evidence cũ và báo
đang cập nhật. Không giữ transaction DB trong lúc chờ model. Nếu marker hiện có
không phân biệt refresh đầy đủ, Phase 0 chốt metadata version theo bảng cập nhật
cùng transaction sync trước khi mở rộng.

## 3. Quyền DB và metric layer

Tạo Supabase client server theo từng request với user JWT để RLS có hiệu lực;
không import singleton browser `src/utils/supabaseClient.js`. Client service role
riêng chỉ quản lý quota/usage, không truyền cho tool dispatcher.

RPC đọc dùng SECURITY INVOKER, tên/parameters cố định, column allowlist, không
dynamic SQL từ model. Kiểm tra grants/RLS live; email allowlist của app không thay
RLS. Nếu quyền chưa đủ, viết migration/test đúng phạm vi thay vì bypass bằng
service role. Không cho tool gọi RPC sync hoặc thao tác ghi vận hành.

Ưu tiên aggregate DB rồi mới đưa kết quả sang model. Không sao chép
`fetchAllRows().select('*')` để tải mọi bảng mỗi câu hỏi. Query cần pagination
phải có order ổn định, không coi 1.000 rows mặc định PostgREST là toàn bộ dữ liệu.
Trần ban đầu: 5s/query, 50 dòng/result, 16 KiB/result; top-N/cắt rows sau khi
aggregate/ranking, có truncated. Kiểm tra EXPLAIN/index trên dữ liệu đại diện.

| Nguồn logic repo | Cần bảo toàn |
|---|---|
| `dataProcessor.js` | reassignKaRegion, getHubType, nhóm ngày và công thức KPI |
| `insightAnalysis.js` | computeKpiDeltas, attention ranking, giới hạn narrative |
| `leadtimeCalc.js`, `laneTaxonomy.js` | Weighted/NULL, chuẩn hóa lane, baseline trước kỳ, sample |
| `clientLabels.js`, `defaultDataset.js` | Nhóm client và target hiện hành |
| `Report5LaneCa1.jsx` | Công thức Ca 1: tách hàm thuần nếu dùng chung |

Hàm JS tái dùng phải chạy trong Node (ESM imports đúng extension, không DOM/React).
Nếu chuyển aggregate sang SQL, test fixture SQL/JS cùng nguồn/ngày/scope trước
khi dùng. Giữ grain ngày cần cho median/baseline; không thay bằng mean toàn kỳ.
Tỷ lệ, delta, weighted average và ranking do code/SQL tính; Luna diễn giải.
Không đổi thiếu data thành 0, không biến tương quan thành nguyên nhân đã chứng minh.

## 4. Tools server-side và glossary

| Tool | Input chính | Output |
|---|---|---|
| `get_data_coverage` | Dataset/client hợp lệ | Coverage, sync marker, dimensions hỗ trợ |
| `get_metric_summary` | Metric, client, kỳ, grain, sort, limit | KPI, tử/mẫu và evidence |
| `get_latest_metric_summary` | Metric, client, grain, sort, limit | Tự lấy ngày mới nhất từ coverage rồi trả KPI/evidence |
| `get_leadtime_summary` | Client, kỳ, lane/cặp tỉnh | Bốn chặng/E2E, sample và evidence |
| `get_ca1_summary` | Kỳ, lane, vùng | Tỷ lệ/tử/mẫu, coverage; không giả client filter |
| `get_metric_definition` | Metric enum | Formula/định nghĩa từ glossary repo |
| `get_dashboard_help` | Topic enum | Hướng dẫn chức năng có thật và route allowlist |

OpenAI function schemas dùng type function, strict true, additionalProperties false;
field tùy chọn nullable và vẫn trong required. Strict đảm bảo cấu trúc arguments;
server vẫn validate quyền, enum, ngày, limit và tính hợp lệ nghiệp vụ.

Không có navigate tự đổi UI v1. Help trả link/chip để user mở report; route được
allowlist trên client. Không có tools ghi DB, export, gửi tin, web search, shell,
MCP tổng quát hoặc arbitrary SQL.

`src/data/metricGlossary.js` giữ định nghĩa OPR/ODR/1st Pickup/1st Delivery/Ca 1/
bốn chặng, đơn vị, target, công thức, NULL/sample rules và ngày hiệu lực. Dùng lại
target constants hiện có thay vì tạo bản sao dễ lệch. Dashboard help cũng có version.

Mọi số cần evidence lượt hiện tại hoặc glossary cố định. Chỉ gửi cột allowlist và
label giới hạn độ dài tới model. Text trong DB vẫn là untrusted; XML/JSON chỉ phân
tách nội dung, không tự chặn injection. Test label chứa chỉ thị giả, HTML và yêu
cầu truy cập ngoài scope. Không dùng denylist kiểu “bỏ field có phone”.

## 5. Backend OpenAI Responses API

```text
api/chat.js                    POST entrypoint
server/chat/auth.js            JWT + email policy
server/chat/protocol.js        body/history validation
server/chat/quota.js           atomic reserve/finalize
server/chat/agent.js           Responses API + server tool loop
server/chat/db.js              user-scoped queries/RPC
server/chat/tools.js           schemas + read-only dispatcher
server/chat/context.js         evidence metadata và byte budget bảo thủ
server/chat/sse.js             SSE ứng dụng
src/data/metricGlossary.js     glossary không secrets
src/data/dashboardHelp.js      hướng dẫn đã đối chiếu app
```

Khi implementation cài SDK `openai`, khóa version bằng lockfile; không import SDK/
server helpers vào bundle client. JS/JSX có thể dùng JSDoc type SDK, không cần đổi
cả project sang TypeScript.

Ví dụ cấu hình upstream, chưa phải implementation hoàn chỉnh:

```js
const stream = await openai.responses.create({
  model: 'gpt-5.6-luna',
  instructions: SERVER_INSTRUCTIONS,
  input: serverBuiltInput,
  tools: READ_ONLY_TOOLS,
  reasoning: { effort: 'low' },
  max_output_tokens: 2048,
  store: false,
  stream: true,
}, { signal });
```

2.048 là trần thử nghiệm gồm reasoning và visible output, không phải độ dài answer
mong muốn. So sánh none/low trên Luna bằng eval; không mặc định effort nhỏ nhất
luôn xử lý tốt câu nhiều bước.

Server ghép response hoàn chỉnh rồi xử lý function_call. Responses API trả
`arguments` dạng JSON string: `JSON.parse(item.arguments)`, validate rồi dispatch.
Giữ response.output, kể cả reasoning items cần thiết, trong input vòng kế tiếp và
thêm function_call_output đúng call_id. Không thực thi input delta còn dở. Với
store false, spike phải verify replay reasoning/encrypted content theo SDK hiện
hành; không dựa vào response đã lưu ở provider. Tool transcript chỉ sống trong RAM
request, không gửi về browser.

Tối đa hai query độc lập chạy song song; so sánh cần snapshot chung thì dùng batch
RPC. Tối đa ba vòng tool, bốn calls/batch, bốn lần gọi model/câu; lượt cuối tắt tools
để tổng hợp hoặc báo thiếu dữ liệu. Implementation chặn history theo ký tự và
evidence theo UTF-8 bytes ở mức bảo thủ; token thật lấy từ usage của provider để
đo và tinh chỉnh, không coi string.length là token count.

Không cache raw data xuyên user. Giữ instructions/glossary/schemas ổn định để tận
dụng prompt cache khi có; đo cached tokens, không giả định cache luôn hit. Store
false không đồng nghĩa không có retention khác ở provider; kiểm tra data controls.

Với KPI pickup/delivery, câu “hiện tại”, “hôm nay”, “mới nhất” hoặc không nêu ngày
dùng `get_latest_metric_summary`: server đọc `dataAsOf` từ coverage rồi query đúng
ngày đó. “Vùng/miền”, “hub/kho”, “tệ nhất”, “tốt nhất” được ánh xạ sang grain/sort
an toàn. Chỉ hỏi lại KPI hoặc client khi lịch sử cũng không xác định được.

## 6. Auth, quota và ngân sách

Client gửi Bearer Supabase access token; server verify bằng auth.getUser(token)
và policy email hiện có. Tách isAllowedEmail vào src/utils/authPolicy.js, cập nhật
imports AuthModal.jsx/App.jsx, dùng chung với server. Lấy user ID từ JWT đã verify,
org từ server config. Không nhận email/org/admin flag trong body làm quyền.

| Metadata | Khóa/ý nghĩa |
|---|---|
| ai_chat_quota_daily | Unique scope/user-or-org/day; số câu, reserved/used cost |
| ai_chat_requests | Unique user/requestId, payload hash, status, deadline/lock |
| ai_chat_usage | Unique request/round; model, effort, tokens, tool names, latency/status |

RPC reserve khóa bucket cùng thứ tự org rồi user trong một transaction, kiểm tra
limit/claim trước upstream. Không count-then-insert tách rời. Finalize atomic và
idempotent đúng một lần. Client service role riêng gọi quota RPC; RLS chặn browser
đọc/ghi metadata và revoke execute khỏi anon/authenticated. SECURITY DEFINER cho
quota phải có search_path cố định và schema-qualified names.

- Ban đầu 60 câu/user/ngày, 600 câu/org/ngày; ngày Asia/Ho_Chi_Minh. Một câu tăng
  count một lần nhưng từng API round phải reserve cost. Một in-flight/user.
  Quota DB lỗi thì dừng trước upstream.
- Pilot đề xuất trần USD 0,50/user/ngày và USD 5/org/ngày cho model. Đây là giới
  hạn cấu hình, không phải dự báo chi tiêu; Phase 0 chốt trước pilot.
- Reserve input với giá uncached/cache-write cao nhất áp dụng và trần output;
  reconcile usage thật. SDK maxRetries: 0 ở v1, không có calls tính phí bị ẩn.
- Lỗi chắc chắn trước upstream release cost. Abort/timeout không rõ usage giữ
  reservation và đánh dấu unknown. Cleanup sau deadline giải phóng in-flight lock,
  chuyển cost thành estimate bảo thủ nếu không reconcile được.
- Metadata giữ 30 ngày; không log prompt, query results hoặc raw SDK errors.
  Không đưa email/JWT/credentials vào model. Redact payload trong error logging.

## 7. Streaming và vòng đời request

Browser dùng fetch POST + ReadableStream, server trả text/event-stream và
Cache-Control no-store. Parser chịu được SSE/UTF-8 bị tách giữa chunks.

| Event ứng dụng | Chức năng |
|---|---|
| message_start | Request ID, bắt đầu câu trả lời |
| status | Đang tra DB / đang phân tích; không lộ SQL |
| text_delta | Text đang stream |
| sources | Evidence ID, phạm vi, ngày/sync do server tạo |
| message_end | Complete/incomplete/refused và usage summary phù hợp |
| error | Mã lỗi an toàn, thông báo tiếng Việt |

Adapter xử lý response.output_text.delta, response.refusal.delta,
response.completed và failure/incomplete của Responses API. Nếu stream không có
delta, lấy text hoàn tất từ response output; nếu vẫn rỗng thì tổng hợp lại đúng
một lần và trả `CHAT_MODEL_EMPTY` thay vì phát message_end giả thành công.
Nếu vòng planner không gọi tool nhưng đã có text (ví dụ câu hỏi làm rõ), server trả
text đó trực tiếp và không gọi thêm một lượt tổng hợp.
Upstream completed nhưng có function calls là bước
trung gian; chỉ đóng SSE khi hết tool loop. Không render reasoning/arguments thô.

Text của bước model chọn tool được giữ ở backend. Sau khi có evidence, bước tổng
hợp cuối tắt tools và stream answer. Help/glossary không cần số mới có thể stream
trực tiếp. Validator kiểm tra references/scope; eval kiểm tra số. Không coi prompt
là bảo đảm tuyệt đối chống bịa.

Lỗi trước headers dùng HTTP 400/401/403/409/413/429/5xx; sau headers dùng error event.
Một stream có một terminal event khi còn kết nối. Mất terminal event => interrupted;
hết output tokens => incomplete, không giả complete.

Stop, đóng panel/logout abort request; server truyền abort tới model/DB request,
DB statement timeout là chốt cuối. Client dùng request ID bỏ stale events, không
tự retry timeout. Khởi đầu deadline cả turn 90s, mỗi model round 20s (không vượt
deadline còn lại), mỗi DB query 5s. Function duration phải đủ turn + finalize;
điều chỉnh bằng spike. Mascot luôn thoát thinking khi error/abort.

## 8. Mascot 2D

Triển khai local 09/09/2026: `src/components/chat/Mascot.jsx`, `mascot.css`,
`src/utils/mascotState.js` và asset `public/mascot/kas-parcel.png`.
Mascot là kiện hàng nhỏ, mắt rõ, tay ngắn, khăn/mũ cam; ảnh PNG nền trong suốt
được tạo bằng công cụ ImageGen tích hợp. Prompt/provenance nằm cạnh asset.
Thay thiết kế SVG dự kiến bằng một hình tĩnh duy nhất, chuyển động toàn thân qua
pivot cố định 50% 90%; chưa có rig mặt, blink hay animation miệng riêng.
Launcher 68px desktop / 60px mobile; avatar panel 52px; hình chào 100px.
Container dùng tokens và hỗ trợ `body.dark-mode`; ảnh không đổi màu theo theme.

| State v1 | Trigger | Motion |
|---|---|---|
| idle | Không request/input focus | Thở nhẹ một chu kỳ rồi nghỉ khi panel mở |
| listening | Input focus, không request | Nghiêng nhẹ |
| thinking | Query DB/chờ model | Nhấp nhô nhỏ, kèm trạng thái text |
| speaking | Answer đang stream | Nhịp cố định, không một tween mỗi token |
| error | Lỗi/quota/timeout | Một phản ứng ngắn rồi nghỉ, kèm text |

Ưu tiên error -> speaking -> thinking -> listening -> idle. User hủy về idle.
Answer xong không có nghĩa KPI tốt. Happy/worried/sleeping để v1.1; nếu thêm cảm
xúc KPI phải derive từ evidence metadata (tone/belowTargetCount), không dò từ trong
câu trả lời.

- Base pose bằng CSS, luôn hiển thị cả khi mount trong tab ẩn. Một effect sở hữu
  timeline qua `gsap.context`, revert trước đổi state/unmount.
- Lắng nghe `visibilitychange` và `matchMedia` change để cleanup/restart.
- Launcher luôn tĩnh; chỉ avatar trong panel mở có chuyển động. Thinking/speaking
  loop theo trạng thái request, không tạo tween cho từng token. Print ẩn panel/launcher.
- Reduced motion luôn hiện mascot đầy đủ. Mascot aria-hidden; mọi trạng thái quan
  trọng có text riêng trong chat.
- Ảnh lỗi tải có icon chat dự phòng. Đóng/Escape hủy request và trả focus về launcher.
- Kiểm chứng local bằng fixture SSE độc lập (không gọi model/DB thật), unit test
  chuyển trạng thái và build. Chưa đồng nghĩa đã deploy hoặc test production.

## 9. Chat UI

Files: ChatLauncher.jsx, ChatPanel.jsx, ChatMessage.jsx, useChat.js, chat.css.
useChat chỉ fetch/SSE/cancel/history, không query DB hoặc chạy tools.

Panel ghi “Tra cứu dữ liệu KAS trong database”, có câu hỏi mẫu. Answer hiện nguồn,
ngày và phạm vi để hiểu chênh lệch với view cũ. Có Stop và hỏi lại khi lỗi.

- Desktop non-modal role dialog có accessible name; mở focus input, Escape đóng
  trả focus launcher, không trap toàn dashboard.
- Mobile sheet đủ chỗ đọc, tính safe area/nav/bàn phím; modal thì aria-modal,
  focus trap, background inert. Chỉ một modal tương tác cùng lúc.
- Live region thông báo trạng thái/answer hoàn tất, không từng token. Không ép
  scroll xuống khi user đang đọc phía trên.
- Launcher tránh home-fab bottom/right 2rem và mobile-bottom-nav. Desktop z-index
  khởi đầu 1100, dưới toast 1200, Command Palette 1400 và modal. Mobile modal dùng
  cơ chế overlay app. Fullscreen dựa app state để ẩn chat, tránh selector sibling sai.
- Print/DOM export không có mascot/chat. Lazy-load, SDK/backend không vào browser.
- Iframe mặc định ẩn launcher. Host bật qua postMessage phải kiểm tra origin
  allowlist, source === window.parent và schema. Listener scope App.jsx hiện chưa
  kiểm origin đầy đủ; không sao chép nguyên pattern.
- Markdown subset render React elements, không raw HTML/innerHTML. Unsupported
  syntax thành plain text; links validate protocol/route. CSP không thay escaping.

## 10. Chi phí Luna và đo lường

[Trang Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) đã mở đọc
ngày 08/09/2026 xác nhận input USD 0,20, cached input USD 0,02, output USD 1,20 trên
một triệu token. Model hỗ trợ streaming, function calling và effort none/low/medium/
high/xhigh/max. Chọn Luna theo ưu tiên chi phí, không khẳng định rẻ nhất mọi API.

Ví dụ sizing: tổng tất cả vòng API của một câu là 8.000 input uncached + 1.000
output gồm reasoning:

```text
8.000 / 1.000.000 * 0,20 + 1.000 / 1.000.000 * 1,20 = USD 0,0028/câu
50 câu/ngày * 30 ngày = USD 4,20/tháng
600 câu/ngày * 30 ngày = USD 50,40/tháng
```

Đây là minh họa, chưa benchmark; không gồm DB/Vercel/thuế, retry hay cache-write
phụ phí nếu áp dụng. Không cộng reasoning hai lần nếu đã nằm trong output total.
Sizing report gom mọi round: input/cache/output, số query, failure, latency text
đầu/hoàn tất p50/p95 và USD/câu/ngày. So sánh none/low trên cùng fixture Luna, chọn
cấu hình rẻ nhất đạt eval. Không nâng model tự động.

Dùng API key/billing project cho ứng dụng, không lấy credential hoặc phiên Codex
làm backend. Quyền gọi model của tài khoản phải test trong Phase 0.

## 11. Lộ trình

| Phase | Đầu ra kiểm tra được | Ngày |
|---|---|---|
| 0 | Model access, schema/RLS, query thật, route/SSE/abort, quota/sync marker | 1–2 |
| 1 | Auth/quota + chat shell + glossary/help + một metric DB tool + sources | 2–3 |
| 2 | DB tools còn lại, scope/coverage, SQL/JS parity, query/history budgets | 3–4 |
| 3 | Mascot tĩnh duyệt, năm state, dark/reduced-motion/visibility | 2 |
| 4 | 40 câu eval, quyền/concurrency/lỗi, browser/mobile/embed, sizing report | 3–4 |
| Tổng | Một người, tùy schema/RPC sẵn sàng | **11–15 ngày làm việc** |

Phase 0 kiểm /api/ping trên preview vì vercel.json catch-all tới index.html;
xác nhận POST/API route, CSP và SSE không buffer. Node hỗ trợ streaming; đọc plan/
Fluid Compute/maxDuration thực tế. Edge vẫn có cap, không dùng như cách né timeout.
Dọn route spike trước production. Nếu stream chưa đạt, thử non-stream cùng deadline/
abort/quota rồi đo latency thật.

DB spike xác minh bảng/schema/coverage, user permissions, sync marker và một metric
end-to-end. Nếu quyền/model access thiếu thì ghi blocker; UI mock/contract vẫn có
thể tiếp tục, không tự đổi model. Chốt hỏi -> query DB -> số có nguồn -> answer
trước khi mở rộng. Một người sở hữu metric contract và tích hợp, mascot phụ thuộc
state machine/UI. Rollout bằng feature flag, pilot nội bộ, mở rộng sau eval;
kill switch dừng endpoint/API spend, dashboard vẫn dùng bình thường.

## 12. Định nghĩa xong

- Implementation đạt npm run lint, npm test, npm run build. Bổ sung server/RPC
  tests vào script/CI vì hiện chỉ chạy src/utils/*.test.mjs. Lần sửa docs này chỉ
  cần kiểm diff và nhất quán, không coi test app là bằng chứng cho kiến trúc mới.
- 40 câu: 20 số (client/ngày/vùng/lane, tỷ lệ/delta/NULL/weighted), 8 glossary/help,
  6 thiếu/mơ hồ/coverage, 6 injection/vượt scope. Expected từ fixture/query xác định.
- 20/20 câu số khớp tử/mẫu/ngày/scope/làm tròn; glossary/help đúng; thiếu data thì
  hỏi rõ hoặc từ chối đúng. 0 số bịa, 0 vượt quyền trong bộ eval, không hứa tuyệt
  đối cho mọi câu ngoài tập kiểm thử.
- Tab/filter UI không đổi query scope; câu nối tiếp theo scope đã nói trong chat;
  DB mới hơn browser vẫn trả DB với timestamp đúng.
- Test >1.000 rows, top-N sau aggregate, NULL/zero, thiếu bảng/nguồn lỗi, refresh
  giữa calls, đa bảng khác coverage và SQL/JS parity.
- JWT giả/hết hạn/user ngoài quyền; body/history chứa role/tool/SQL giả; query
  injection; concurrency/quota/replay; lock timeout đều có test.
- Preview thật kiểm UTF-8/chunking, incomplete/refusal, Stop/logout/đóng panel,
  disconnect, stale event; không kẹt thinking.
- Keyboard/mobile/bàn phím ảo/embed origin, live region, dark/print/export/fullscreen.
  Reduced-motion tĩnh đầy đủ; mount hidden rồi hiện đúng; không rò timer/timeline.
- Initial bundle tăng <=30 KB gzip so baseline đo, chat lazy, không SDK/secret.
- Pilot mục tiêu p95 <=20s/câu và DB query p95 <=2s trên dataset đại diện. Report
  ghi số đo/số mẫu/cold-warm/cache và giới hạn; không đạt thì điều chỉnh trước mở
  rộng. Feature flag và budget kill switch được test.

## 13. Ngoài v1

- SQL tùy ý do model viết hoặc warehouse ngoài bốn bảng KAS.
- Tools ghi dữ liệu vận hành, export hoặc tự gửi tin.
- Đọc màn hình, rows RAM hoặc tự đổi bộ lọc UI.
- Nội dung history lưu server, sync đa thiết bị, voice.
- Happy/worried/sleeping, rig nhiều bộ phận hoặc animation mặt riêng.
- Tự chuyển model đắt hơn/routing nhiều model.

## 14. Nguồn và giới hạn xác minh

- [Luna model/API/pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna): model ID, capabilities, giá, effort đã mở đọc trong lượt sửa docs.
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling): arguments, call_id, function_call_output, replay items.
- [OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses): typed events/lifecycle.
- [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data): store/retention; kiểm chính sách tài khoản trong spike.
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations) và [rewrites config](https://vercel.com/docs/project-configuration/vercel-json): nguồn đã đối chiếu trong review, chưa verify cấu hình live.
- Repo: src/utils/supabaseSheetSync.js, docs/google-sheet-supabase-sync.md,
  supabase/migrations/20260820_create_kas_leadtime_data.sql, src/utils/gsapSetup.js,
  các metric modules mục 3 và src/App.jsx.

Chưa chạy API tính phí, query DB live, migration hoặc deployment trong lần sửa docs.
