# Phạm vi hội thoại cho người dùng

Chatbot nhận câu hỏi tự do về app ở cấp người dùng, logistics/ecommerce trong và ngoài nước, tin tức liên quan và kiến thức AI phổ thông. Quy tắc tại `server/chat/conversation-policy.js` áp dụng cho mọi người dùng; metadata tab Dev Admin hoặc tự xưng dev không mở rộng phạm vi.

| Loại câu hỏi | Nguồn và hành vi |
| --- | --- |
| Khái niệm/cách dùng app | Tool định nghĩa, trợ giúp người dùng; không ép chọn client/ngày |
| Kiến thức logistics/ecommerce/AI, ví dụ giả định | Trả lời trực tiếp, phân biệt minh họa và dữ kiện |
| Số liệu vận hành app | RPC cố định dưới JWT hiện có; giữ scope; flow chọn KPI chỉ dùng khi cần tra cứu |
| Tin tức/thông tin bên ngoài có thể thay đổi | Một lượt nghiên cứu công khai, tối đa hai built-in web calls; link nguồn, ngày và giới hạn xác minh |
| Dev Admin, BXH đang ẩn với user, SMS scoring, cấu hình nội bộ | Từ chối phần nội bộ; câu trộn nhiều ý vẫn trả lời phần hợp lệ |
| Đơn/tài xế COD chi tiết | Chưa có tool đọc dữ liệu này; chỉ giải thích cách dùng, không bịa danh sách/số liệu |

`search_public_information` là function do agent gọi. Server tạo request OpenAI riêng chỉ chứa topic và câu tra cứu công khai; không gắn lịch sử, screenContext hoặc evidence database vào request web. Có kiểm tra một số dạng định danh phổ biến và chủ đề nội bộ trước khi gọi. Model vẫn chịu trách nhiệm chọn và loại bỏ dữ liệu riêng khỏi câu tra cứu; kiểm tra mẫu không phải bộ phát hiện mọi thông tin cá nhân.

Web search mặc định bật; `AI_CHAT_WEB_SEARCH_ENABLED=false` tắt riêng web, vẫn giữ chat kiến thức và database. Model đang cấu hình được giữ nguyên. Nếu model/account không hỗ trợ web hoặc nguồn không xác minh được, trả `available=false` cho agent, không trả nội dung tìm kiếm thiếu nguồn. Phí search cộng vào telemetry chi phí lượt chat, token vẫn tính theo model. Nguồn web hiển thị bằng link Markdown, không trộn vào thẻ phạm vi database.

## Kiểm chứng

Unit/integration tests dùng phản hồi model giả lập để kiểm tra schema, luồng tool, scope, citation, phí và fallback. Chúng không chứng minh model thật luôn tuân thủ phạm vi.

`node scripts/chat-scope-eval.mjs` in bộ ca nghiệm thu, không gọi API. Có key hợp lệ thì chạy `node --env-file=.env.local scripts/chat-scope-eval.mjs --live [case-id]` và đọc output theo tiêu chí từng ca. Chế độ live có phí model/web; không đọc dữ liệu vận hành thật hoặc dùng quyền quản trị. Trước khi coi là nghiệm thu production, kiểm tra model/account thật với các ca khái niệm, COD, AI, tin tức, câu trộn ý và yêu cầu nội bộ.

Tài liệu API dùng khi triển khai: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [OpenAI tool pricing](https://developers.openai.com/api/docs/pricing).
