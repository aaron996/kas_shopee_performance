# Quản lý model chatbot

## Kích hoạt

1. Áp dụng `supabase/migrations/20261006120000_ai_model_registry.sql` trước khi deploy code.
2. Giữ cấu hình backend hiện có: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` và `CRON_SECRET`. Không đưa key vào frontend.
3. Deploy. `vercel.json` đăng ký `/api/cron/ai-model-sync` vào 01:00 UTC mỗi ngày (08:00 giờ Việt Nam). Lịch chỉ chạy trên production và cần kiểm tra giới hạn cron của gói Vercel đang dùng.
4. Dev Panel → AI Operations → Quản Lý Model → Đồng bộ từ OpenAI. Kiểm tra thời điểm đồng bộ và số model mới.

Code mới có fallback danh sách cũ nếu bảng registry chưa tồn tại; các thao tác quản lý chỉ mở sau migration. Lỗi database khác không fallback. Bốn model hiện có và giá hiện tại được seed nguyên trạng, không tự thay cấu hình All/user.

## Sử dụng

- Đồng bộ đọc toàn bộ danh sách mà API key truy cập được trước khi ghi snapshot vào database. Đồng bộ lỗi/rỗng giữ dữ liệu cũ. Sync không sửa definition, giá, reasoning hay trạng thái bật.
- Model mới mặc định chưa bật. Bộ lọc tên chỉ gợi ý model chatbot; bật “Hiện cả model khác” để xem toàn bộ inventory. Model có tên mới khác quy ước vẫn tìm được tại đây hoặc thêm thủ công.
- Sửa tên, mức reasoning, mức mặc định và giá theo tài liệu OpenAI. Giá nhập USD / triệu token, tối đa 3 chữ số thập phân. Để trống là chưa biết, khác giá 0.
- Kiểm tra thực hiện yêu cầu Responses/function calling nhỏ cho mỗi reasoning đã khai báo, tối đa 1024 output tokens/yêu cầu. Không gửi dữ liệu vận hành. Có thể phát sinh phí; phí probe không thuộc bảng quota/chat usage hiện có.
- Probe xác nhận Responses, function calling và reasoning đã khai báo; không chứng minh chất lượng câu trả lời, web search, streaming hay mọi công cụ. Sau khi bật, thử một user trước với câu hỏi dữ liệu và tra cứu công khai.
- Bật yêu cầu probe đạt ở revision hiện tại và đủ ba giá. Vào Cấu Hình Chatbot → Chatbot để chọn model cho All hoặc user rồi Áp dụng. Bật không tự thay model đang chạy.
- Muốn sửa model đã bật: chuyển các cấu hình đang dùng sang model khác, tắt rồi sửa/kiểm tra lại. Không tắt được model mặc định môi trường hoặc model còn được config tham chiếu. Giữ các model mặc định môi trường trong danh sách cũ; model mới sử dụng qua cấu hình database.
- Danh sách này phục vụ chatbot. COD SMS tiếp tục dùng danh sách model cũ và cấu hình độc lập.

## Xác minh và vận hành

- API quản lý yêu cầu JWT hợp lệ và role Dev qua database. Registry/audit/RPC chỉ cấp quyền service_role, RLS bật và revoke quyền anon/authenticated.
- Revision ngăn lưu/probe/bật bằng dữ liệu cũ. Khóa row và trigger phối hợp thao tác Apply và Tắt trong database.
- Đồng bộ giữ model đang bật dù model biến mất khỏi inventory, hiển thị cảnh báo để Dev chuyển cấu hình; không tự chuyển hoặc xóa model.
- Audit ghi sync/save/probe/toggle và actor. Không lưu API key hoặc thông báo lỗi gốc của provider.
- Tests: `npm test`, `npm run build`, `npm run lint`. SQL regression dùng PGlite kiểm tra grants, probe/giá/revision, giữ nguyên definition khi sync và chặn model đang dùng.
- Trước khi production: kiểm tra migration đã áp dụng, manual sync thật, probe thật, Apply cho user thử, một lượt chat có usage/giá đúng và cron log ở lần chạy kế tiếp.
# Tìm giá token

Trong form sửa model, **Tìm giá từ OpenAI** đọc mục Text tokens trên trang tài liệu chính thức đúng Model ID và điền Input, Cached input, Output. Không cần API key cho thao tác đọc giá công khai. Nguồn, thời điểm tra cứu và điều kiện phụ phí được hiển thị để Dev xem lại trước khi lưu. Giá chỉ là giá cơ bản để ước tính; Batch/Flex/Fast, cache writes, ngữ cảnh dài và xử lý theo vùng có thể có mức giá khác.

Tra cứu không tự lưu, bật model hoặc sửa reasoning. Khi nguồn thiếu giá, sai đơn vị hoặc không xác định được đúng model, form giữ nguyên giá đang nhập và báo lỗi. Sau khi lưu thay đổi cần kiểm tra lại model trước khi bật.
