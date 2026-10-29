# MCP server cho agent ngoài đọc dữ liệu dashboard

`POST /api/mcp` là một MCP server (giao thức [Model Context Protocol], transport
Streamable HTTP, stateless — mỗi request tự tạo server/transport riêng, không
giữ session) để các agent khác (Claude Code, Claude Desktop, agent nội bộ...)
đọc cùng bộ dữ liệu dashboard mà chatbot trong app đang đọc.

## Vì sao tái dùng CHAT_TOOLS thay vì viết tool mới

`server/chat/tools.js` đã có sẵn 8 tool đọc dữ liệu (KPI theo ngày, coverage,
summary theo vùng/hub, CA1, leadtime, glossary, help) với validate đầu vào,
giới hạn khoảng ngày, giới hạn số dòng trả về và chặn SQL tự do — đây chính là
bề mặt an toàn đã được kiểm nghiệm qua chatbot production. `server/mcp/server.js`
chỉ bọc lại đúng các tool đó (`executeChatTool`) bằng MCP SDK, lọc bỏ 2 tool
chỉ có ý nghĩa trong vòng lặp hội thoại UI (`request_metric_query`,
`search_public_information`). Không có truy vấn SQL hay bảng/cột mới nào được
mở thêm qua đường này.

## Cấu hình

Thêm vào biến môi trường server (Vercel project settings hoặc `.env`):

```
SUPABASE_URL=...                 # đã có sẵn cho chatbot
SUPABASE_SERVICE_ROLE_KEY=...    # đã có sẵn cho chatbot
MCP_API_KEY=<chuỗi random dài>   # mới, bắt buộc để bật endpoint
```

Không set `MCP_API_KEY` thì endpoint trả `503` cho mọi request — mặc định
tắt. Mỗi agent ngoài dùng chung một key này qua header
`Authorization: Bearer <MCP_API_KEY>` (so sánh constant-time, xem
`server/mcp/auth.js`). Muốn cấp/thu hồi quyền theo từng agent riêng thì tạo
nhiều key và tự thêm bước tra bảng trong `isMcpKey`/`api/mcp.js` — hiện tại
chỉ hỗ trợ một key dùng chung.

## Kết nối từ agent khác

Với Claude Code / client hỗ trợ MCP remote qua HTTP, thêm server dạng:

```json
{
  "mcpServers": {
    "kas-shopee-performance": {
      "url": "https://<domain-app>/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_API_KEY>" }
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

## Giới hạn đã biết

- Chạy bằng `SUPABASE_SERVICE_ROLE_KEY` (không có người dùng đăng nhập cụ thể
  đứng sau mỗi lệnh gọi), nên không áp dụng theo RLS theo user — toàn bộ kiểm
  soát phạm vi dữ liệu nằm ở validate tham số trong `executeChatTool` và ở các
  RPC `get_ai_chat_*` phía Supabase.
- Không có quota/rate-limit riêng cho MCP (khác với chatbot có
  `server/chat/quota.js`). Nếu mở cho nhiều agent, cân nhắc thêm giới hạn
  trước khi mở rộng phạm vi dùng.
- Chỉ một `MCP_API_KEY` dùng chung; chưa phân quyền/theo dõi theo từng agent.
