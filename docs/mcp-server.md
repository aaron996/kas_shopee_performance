# MCP server cho agent ngoài đọc dữ liệu dashboard

`POST /api/mcp` là một MCP server (giao thức [Model Context Protocol], transport
Streamable HTTP, stateless — mỗi request tự tạo server/transport riêng, không
giữ session) để các agent khác (Claude Code, Claude Desktop, Claude.ai, agent
nội bộ...) đọc cùng bộ dữ liệu dashboard mà chatbot trong app đang đọc.

Xác thực bằng **OAuth 2.1**: người dùng đăng nhập Google qua đúng flow Supabase
Auth mà dashboard đang dùng (`src/components/AuthModal.jsx`), được chặn bằng
cùng `checkEmailAllowed` (mặc định `@ghn.vn`, hoặc email trong allowlist). Mỗi
người có access token riêng — không có secret tĩnh dùng chung nào để lộ.

## Vì sao tái dùng CHAT_TOOLS thay vì viết tool mới

`server/chat/tools.js` đã có sẵn 8 tool đọc dữ liệu (KPI theo ngày, coverage,
summary theo vùng/hub, CA1, leadtime, glossary, help) với validate đầu vào,
giới hạn khoảng ngày, giới hạn số dòng trả về và chặn SQL tự do — đây chính là
bề mặt an toàn đã được kiểm nghiệm qua chatbot production. `server/mcp/server.js`
chỉ bọc lại đúng các tool đó (`executeChatTool`) bằng MCP SDK, lọc bỏ 2 tool
chỉ có ý nghĩa trong vòng lặp hội thoại UI (`request_metric_query`,
`search_public_information`). Không có truy vấn SQL hay bảng/cột mới nào được
mở thêm qua đường này.

## Vì sao không có file `api/mcp.js` hay `api/oauth/*.js`

Project đã chạm trần 12 Serverless Functions của gói Hobby trên Vercel (xem
comment trong `api/chat-suggestions.js` về `/api/weather`). Thêm hẳn các file
`api/mcp.js`, `api/oauth/*.js` sẽ làm build lỗi
`exceeded_serverless_functions_per_deployment`. Thay vào đó, toàn bộ logic
sống trong `server/mcp/` (ngoài thư mục `api/` nên không bị tính là function
riêng) và được route vào qua rewrite trong `vercel.json`, dùng chung slot
deployment với `api/snapshot-token.js` (xem `createSnapshotTokenOrMcpHandler`
và bảng `MCP_ROUTES`). Với client gọi vào, các URL công khai vẫn là bình
thường (`/api/mcp`, `/.well-known/oauth-authorization-server`, `/api/oauth/*`)
— chi tiết chia sẻ slot là nội bộ.

## Vì sao không có bảng OAuth client/token trong Supabase

Không có đăng ký client cố định (Dynamic Client Registration trả về
`client_id` ngẫu nhiên, không lưu — public client, không `client_secret`,
giống cách Claude tự đăng ký với mọi MCP server khác). Cổng kiểm soát thật sự
là đăng nhập Google + `checkEmailAllowed`, không phải việc giữ bí mật
client_id. Mọi token MCP (`ctx` tạm lúc authorize, authorization code, access
token, refresh token) đều là chuỗi tự chứa, ký HMAC (`server/mcp/oauth-tokens.js`)
với trường `purpose` + `exp` riêng — không cần bảng DB nào, không cần dọn dẹp
token hết hạn. Đánh đổi: không thu hồi được một token access cụ thể trước khi
hết hạn (xem phần Giới hạn).

## Luồng OAuth

1. Agent gọi `GET /.well-known/oauth-protected-resource` rồi
   `GET /.well-known/oauth-authorization-server` để tìm endpoint (chuẩn MCP;
   client MCP tốt tự làm bước này, không cần cấu hình tay).
2. Agent `POST /api/oauth/register` (Dynamic Client Registration) — nhận
   `client_id` ngay, không cần duyệt.
3. Agent mở trình duyệt tới `GET /api/oauth/authorize` (PKCE S256) → server
   redirect sang Supabase (`/auth/v1/authorize?provider=google`, PKCE riêng
   giữa server này và Supabase) → người dùng đăng nhập Google.
4. Supabase redirect về `GET /api/oauth/callback` → server đổi code lấy phiên
   Supabase, kiểm `checkEmailAllowed`, rồi phát authorization code riêng của
   MCP, redirect về agent.
5. Agent `POST /api/oauth/token` đổi code (kèm PKCE verifier) lấy
   `access_token` (1 giờ) + `refresh_token` (30 ngày).
6. Agent gọi `POST /api/mcp` với `Authorization: Bearer <access_token>` —
   mỗi lần đều kiểm tra lại `checkEmailAllowed` (không chỉ lúc phát token).

## Cấu hình

Thêm vào biến môi trường server (Vercel project settings hoặc `.env`):

```
SUPABASE_URL=...                        # đã có sẵn cho chatbot
SUPABASE_ANON_KEY=...                   # đã có sẵn cho chatbot
SUPABASE_SERVICE_ROLE_KEY=...           # đã có sẵn cho chatbot
MCP_OAUTH_SECRET=<chuỗi random dài>     # mới, bắt buộc để bật endpoint
MCP_PUBLIC_BASE_URL=https://<domain>    # mới, URL public cố định của deploy
```

Không set `MCP_OAUTH_SECRET` hoặc `MCP_PUBLIC_BASE_URL` thì mọi endpoint MCP
trả `503` — mặc định tắt. `MCP_PUBLIC_BASE_URL` phải khớp đúng domain thật sự
dùng để gọi `/api/mcp` (OAuth issuer/redirect phải khớp domain, không dùng
`VERCEL_URL` vì nó đổi theo từng deployment).

Yêu cầu hạ tầng có sẵn: Supabase project này đã bật Google provider (dashboard
đăng nhập bằng Google qua `supabase.auth.signInWithOAuth`) — không cần tạo
Google Cloud OAuth app riêng cho MCP.

## Kết nối từ agent khác

Với Claude Code / Claude.ai / client hỗ trợ MCP remote + OAuth, chỉ cần thêm
URL — client tự phát hiện OAuth qua `.well-known` và dẫn người dùng qua bước
đăng nhập Google:

```json
{
  "mcpServers": {
    "kas-shopee-performance": {
      "url": "https://<domain-app>/api/mcp"
    }
  }
}
```

## Danh sách tool

Giống hệt tham số/schema của các tool cùng tên trong `server/chat/tools.js`:

- `get_metric_trend` — KPI P1ST/OPR/D1ST/ODR theo ngày (tối đa 14 ngày/lượt).
- `get_data_coverage` — ngày dữ liệu sớm nhất/mới nhất, thời điểm đồng bộ.
- `get_metric_summary` / `get_latest_metric_summary` — KPI theo vùng/hub/toàn quốc.
- `get_ca1_summary` — tỷ lệ đơn về ca 1 theo lane/vùng.
- `get_leadtime_summary` — leadtime trung bình có trọng số.
- `get_metric_definition` — định nghĩa/công thức/target một chỉ số.
- `get_dashboard_help` — giải thích một khu vực của dashboard.

### Phân trang `get_metric_summary` / `get_latest_metric_summary`

`limit` vẫn tối đa 50 dòng mỗi lần gọi (không đổi — không có lý do kỹ thuật
bắt buộc, chỉ là số mặc định từ lúc dựng chatbot, xem comment đầu
`supabase/migrations/20261029090000_chat_metric_pagination.sql`). Khi cấp
`grain='hub'` (hoặc `region`) có nhiều hơn `limit` dòng thật, kết quả trả thêm
`totalEntities` (tổng số dòng thật, trước khi cắt) và `offset` (đã dùng). Lấy
hết bằng cách gọi lại tăng dần `offset` thêm đúng `limit`, giữ nguyên các
tham số khác và cùng một `sort`, dừng khi `offset + rows.length >= totalEntities`.

## Giới hạn đã biết

- Dữ liệu thật sự được đọc bằng `SUPABASE_SERVICE_ROLE_KEY` (không theo RLS
  per-user) — OAuth chỉ quyết định AI được gọi, không thu hẹp theo người dùng
  Supabase cụ thể hàng-theo-hàng. Phạm vi dữ liệu vẫn do validate tham số
  trong `executeChatTool` và các RPC `get_ai_chat_*` quyết định, giống hệt
  chatbot.
- Access token/refresh token là chuỗi tự chứa (stateless) nên không thể thu
  hồi một token cụ thể trước khi hết hạn; chỉ có thể đổi `MCP_OAUTH_SECRET`
  để vô hiệu hoá *toàn bộ* token đang có. `checkEmailAllowed` được gọi lại ở
  mỗi request `/api/mcp` nên gỡ quyền một email có tác dụng trong vòng tối đa
  1 giờ (TTL access token), không cần đổi secret.
- Authorization code (`mcp_code`) không bị đánh dấu "đã dùng" sau khi đổi lấy
  token — chỉ dựa vào PKCE + TTL 60 giây để giảm rủi ro replay. Chấp nhận
  đánh đổi này ở quy mô nội bộ hiện tại; cần bảng DB theo dõi code đã dùng
  nếu muốn chặt hơn.
- Không có quota/rate-limit riêng cho MCP (khác với chatbot có
  `server/chat/quota.js`). Nếu mở cho nhiều agent, cân nhắc thêm giới hạn
  trước khi mở rộng phạm vi dùng.
