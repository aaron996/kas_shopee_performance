# Biểu đồ inline trong chat

Chat dùng assistant-ui và Recharts 3.10.1 đã cài sẵn. Không thêm dependency,
thực thi code/HTML từ model, hoặc gửi dữ liệu sang dịch vụ chart bên ngoài.

Tham khảo đã kiểm tra ngày 20/10/2026:
- https://github.com/recharts/recharts — renderer React/SVG.
- https://www.assistant-ui.com/examples/generative-ui — Tool UI cho biểu đồ inline.
- https://github.com/vercel-labs/json-render/blob/main/examples/chat/README.md —
  ví dụ chat với catalog component và Recharts; chưa cần thêm framework này cho
  hai kiểu biểu đồ cố định của GHN.

## Hành vi

- Kết quả `get_metric_summary` / `get_latest_metric_summary` có ít nhất hai nhóm
  vùng/hub hợp lệ → cột ngang. Một số tổng hợp toàn quốc vẫn dùng chữ/bảng.
- Xu hướng P1ST, OPR, D1ST, ODR → tool `get_metric_trend`, chart đường theo ngày.
  Trục phần trăm cố định 0–100, nối thẳng các ngày liên tiếp có số liệu; NULL là
  khoảng trống. Không tự thêm target hoặc lấy trung bình các tỷ lệ.
- Chart dùng đúng kết quả DB, phạm vi client/ngày/vùng/loại hub. Model chỉ quyết
  định tool và tham số được phép. `toPublicSource` tạo payload `visualization`
  xác định từ evidence, truyền cùng sự kiện SSE `source` hiện tại.
- Chart hiện sau khi hoàn tất lượt trả lời, dưới nội dung assistant. Pending,
  lỗi và lượt đã dừng không hiển thị chart chưa hoàn tất. Backend cũ không có
  `visualization` vẫn hiển thị văn bản bình thường.
- Khi câu hỏi chart còn thiếu tham số và người dùng trả lời qua thẻ chọn KPI,
  giữ yêu cầu biểu đồ ban đầu cùng query đã xác nhận để không rơi về câu trả lời
  tổng hợp toàn quốc. Query có cấu trúc vẫn được ưu tiên về metric/client/ngày.
- Có tooltip, hỗ trợ bàn phím từ Recharts, và mục “Xem số liệu biểu đồ” chứa
  bảng đầy đủ. Mở bảng không gọi DB. Số liệu tiếng Việt, theme theo app.
- Chart cột hiện tối đa 12 nhóm trên hình; bảng giữ tối đa 50 nhóm đã được RPC
  trả về. Ghi rõ số nhóm được hiển thị, không coi danh sách xếp hạng là toàn mạng.
- Tối đa ba chart trong một câu trả lời; thành phần chart được lazy-load.

## Giới hạn dữ liệu theo ngày

`get_metric_trend` tái dùng RPC `get_ai_chat_metric` đang kiểm quyền theo phiên
người dùng, mỗi lần lấy một ngày ở grain nationwide. Các lệnh gọi chạy tuần tự,
giữ nguyên filter và giới hạn tổng 14 ngày cho mọi lần gọi trend trong một lượt.
Theo dõi abort để không chạy các ngày tiếp theo. Không có migration hay SQL mới.

Đây là triển khai có giới hạn cho cửa sổ ngắn; latency thực tế phụ thuộc RPC
hiện hành. Dải dài hơn cần một RPC tổng hợp theo ngày riêng trước khi mở rộng,
không tải tất cả dòng hub-ngày về client hoặc ngầm cắt bớt kỳ người dùng yêu cầu.
Phạm vi ngày có dữ liệu vẫn theo nguồn KPI hiện tại; chart không mở rộng retention
hay bổ sung KPI/nguồn mà chatbot chưa hỗ trợ.

Ví dụ câu hỏi:
- “Vẽ biểu đồ ODR SPB theo vùng từ 01/10/2026 đến 07/10/2026.”
- “Xu hướng OPR SPE theo ngày trong 7 ngày dữ liệu mới nhất.”
- “So sánh D1ST các hub trong vùng HCM ngày dữ liệu mới nhất.”

## Kiểm tra

- `server/chat/charts.test.mjs`: grounding, dữ liệu thiếu/sai, phạm vi, giới hạn,
  abort, fast path và đường API → agent → tool → source SSE → hoàn tất.
- Test hồi quy chat, build, lint và diff whitespace.
- `output/chat-chart-qa/`: fixture local chạy API/agent/tools/SSE/ChatPanel thật
  với xác thực, model và DB giả lập; browser chỉ dùng Codex IAB. Bằng chứng này
  không xác nhận model thật chọn tool đúng hoặc latency/dữ liệu production.
