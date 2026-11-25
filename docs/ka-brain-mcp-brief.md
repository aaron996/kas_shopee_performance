# Brief: thiết kế MCP server cho KA Brain (trả lời câu hỏi ops KPI)

## Mục tiêu

Dựng một MCP server **read-only** trên bộ dữ liệu ops KPI của team TTS, để gắn vào chatbot KA Brain. Chatbot dùng nó để trả lời các câu hỏi như "OPR hôm qua của vùng X thế nào?", "vì sao D1ST tuần này giảm?", "định nghĩa chỉ số Y là gì?".

Tham khảo MCP của dashboard KAS Shopee Performance (cùng pattern, đã chạy production):

- `docs/mcp-server.md`, `server/mcp/server.js`, `server/mcp/handler.js`, `server/chat/tools.js` trong repo `aaron996/kas_shopee_performance`.

## Nguyên tắc thiết kế (làm đúng như bên mình)

1. **Tool là lớp truy cập dữ liệu duy nhất. Không có SQL tự do.**
   - Mỗi tool có một mục đích hẹp và `inputSchema` (JSON Schema) chặt: `enum` cho metric/grain/sort, `minimum`/`maximum` cho số, ngày dạng `YYYY-MM-DD`.
   - Validate đầu vào ở server (không tin LLM), từ chối tham số sai bằng thông báo rõ.
   - Truy vấn đi qua RPC/function/view đã định nghĩa sẵn ở DB, không ghép chuỗi SQL từ input.

2. **Giới hạn cứng để chống quá tải và rò dữ liệu**
   - Khoảng ngày tối đa mỗi lượt (bên mình: 14 ngày cho trend).
   - Số dòng tối đa mỗi lượt (bên mình: 50), có `offset` + trả `totalEntities` để model tự phân trang.
   - Output là JSON gọn, không trả bảng thô khổng lồ.

3. **Bộ tool nhỏ, đủ cho câu hỏi ops KPI** (đặt tên theo kiểu `get_*`):
   - `get_data_coverage`: ngày dữ liệu sớm nhất, mới nhất và thời điểm đồng bộ của từng dataset. Model gọi trước để biết "hôm nay/mới nhất" là ngày nào.
   - `get_metric_summary` / `get_latest_metric_summary`: KPI theo vùng/hub/toàn quốc, có `sort`, `limit`, `offset`.
   - `get_metric_trend`: KPI theo từng ngày.
   - `get_metric_change_drivers`: so sánh 2 kỳ, trả vùng/hub đóng góp nhiều nhất vào thay đổi (tách hiệu ứng tỷ lệ và hiệu ứng cơ cấu). Tính sẵn ở server.
   - `get_metric_definition`: định nghĩa, công thức, target từng chỉ số.
   - Nếu có thêm nguồn riêng (leadtime, SLA…), mỗi nguồn là một tool `get_*_summary`.

4. **Đưa ngữ nghĩa vào dữ liệu trả về, để model không đoán**
   - Mỗi dòng có `value`, `volume` (mẫu số), `kpiTarget`, `meetsKpi`.
   - Chỉ số càng thấp càng tốt thì trả thêm `direction: "lower_is_better"`.
   - Không có dữ liệu thì trả `noData: true` + `message`. **Không trả 0%.**
   - Mẫu số = 0 thì `value: null`.
   - Kỳ yêu cầu dài hơn phạm vi có dữ liệu thì trả `periodNote` + `actualDateFrom/actualDateTo`.
   - Mỗi nguồn có thể lùi ngày khác nhau, nên trả `as_of_date` riêng.
   - `description` của tool nên nói rõ khi nào dùng, khi nào không, và phải gọi tool nào trước.

5. **Lỗi trả đúng chuẩn MCP**: `{ isError: true, content: [{type:'text', text:'<CODE>: <message>'}] }`, không throw ra ngoài và không lộ stack trace hay thông tin hạ tầng.

## Kiến trúc kỹ thuật

- SDK: `@modelcontextprotocol/sdk`. Dùng `Server` + `StreamableHTTPServerTransport`.
- **Stateless:** `sessionIdGenerator: undefined`, mỗi request tạo server + transport mới và đóng khi `res.on('close')`. Chạy được trên serverless.
- Endpoint: `POST /api/mcp`. Method khác trả 405.
- Đăng ký 2 handler: `ListToolsRequestSchema` (trả danh sách tool) và `CallToolRequestSchema` (whitelist tên tool, gọi hàm thực thi, đóng gói kết quả `JSON.stringify` vào `content[0].text`).
- Tách rõ: định nghĩa tool (name, description, schema) và hàm thực thi (`executeTool`). Chatbot nội bộ và MCP dùng chung một bộ tool, để một logic được kiểm thử một lần.
- Chỉ mở tool read-only. Tool mang tính tương tác UI hoặc có thao tác ghi không đưa vào MCP.

Khung code tối thiểu (rút từ `server/mcp/server.js`):

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const MCP_TOOL_NAMES = new Set(['get_data_coverage', 'get_metric_summary' /* ... */]);

export function createMcpServer({ dbClient }) {
  const server = new Server(
    { name: 'ka-tts-ops-kpi', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    if (!MCP_TOOL_NAMES.has(name)) {
      return { isError: true, content: [{ type: 'text', text: `Tool "${name}" không được phép.` }] };
    }
    try {
      const result = await executeTool({ name, arguments: args ?? {} }, { dbClient });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      const failure = toPublicError(error);
      return { isError: true, content: [{ type: 'text', text: `${failure.code}: ${failure.message}` }] };
    }
  });

  return server;
}
```

## Xác thực (chọn một)

**A. OAuth 2.1 (như bên mình).** Dùng nếu cần agent ngoài (Claude Desktop, Claude Code, claude.ai…) kết nối và biết từng người dùng là ai.

- Expose `/.well-known/oauth-protected-resource` và `/.well-known/oauth-authorization-server`.
- Có Dynamic Client Registration, PKCE S256, đăng nhập Google/SSO nội bộ.
- Chặn theo email domain `@ghn.vn` hoặc allowlist, **kiểm lại ở mỗi request**, không chỉ lúc cấp token.
- 401 phải có header `WWW-Authenticate: Bearer resource_metadata="<base>/.well-known/oauth-protected-resource"`.
- Token tự chứa, ký HMAC, kèm `purpose` + `exp` riêng. Access 1 giờ, refresh 30 ngày. Secret lấy từ env, không commit.

**B. Bearer token tĩnh cho server-to-server.** Dùng nếu chỉ KA Brain (backend) gọi MCP, không cần người dùng cuối đăng nhập. Đơn giản hơn, nhưng token phải nằm trong secret manager và có kế hoạch xoay vòng.

Dù chọn cách nào: mặc định **tắt** (thiếu cấu hình thì trả 503), không để secret trong repo, không log token.

## Điểm bên mình còn thiếu, nên làm tốt hơn ngay từ đầu

- Rate-limit/quota theo user hoặc token. Bên mình chưa có cho MCP.
- Cơ chế thu hồi token (denylist hoặc `jti`). Token HMAC tự chứa không thu hồi được từng cái.
- Đánh dấu authorization code đã dùng (one-time), nếu làm OAuth.
- Ghi audit log: ai gọi tool nào, tham số gì, lúc nào (không log dữ liệu nhạy cảm).
- Nếu dữ liệu cần phân quyền theo vùng/client, áp row-level ở tầng RPC. Bên mình đọc bằng service role nên chưa thu hẹp theo từng người.

## Gắn vào KA Brain

- Khai báo URL MCP (`https://<domain>/api/mcp`) trong cấu hình MCP client của KA Brain:

  ```json
  {
    "mcpServers": {
      "ka-tts-ops-kpi": { "url": "https://<domain>/api/mcp" }
    }
  }
  ```

- System prompt của chatbot nên dặn: gọi `get_data_coverage` trước khi trả lời "hôm nay/mới nhất", nếu chưa rõ thời gian thì hỏi lại người dùng, và không tự suy diễn số liệu khi tool trả `noData`.

## Kiểm thử trước khi bàn giao

- Unit test: validate tham số (sai enum, vượt khoảng ngày, vượt limit), whitelist tool, mapping lỗi.
- Test API: không token → 401 + `WWW-Authenticate`; token sai/hết hạn → 401; email ngoài allowlist → 401; thiếu cấu hình → 503; method khác POST → 405.
- Test dữ liệu: dữ liệu rỗng thật, mẫu số 0, kỳ vượt phạm vi, nguồn lệch ngày, phân trang đủ `totalEntities`.
- Thử end-to-end bằng MCP Inspector hoặc Claude Desktop trước khi gắn vào KA Brain.

## Việc cần bạn phản hồi lại

1. Danh sách chỉ số và nguồn dữ liệu ops KPI TTS (tên bảng/RPC, grain, độ trễ dữ liệu).
2. Chọn auth A hay B.
3. Môi trường deploy (Vercel/Render/…), vì ảnh hưởng cách tách route và giới hạn function.
4. Danh sách tool đề xuất (tên + tham số) để mình review trước khi code.
