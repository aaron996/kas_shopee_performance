# Dev Control Panel

Panel dùng hệ thống màu, typography và token hiện có của GHN. Mục tiêu là tìm đúng chức năng, xem cấu hình đang chạy và thực hiện thay đổi có lưu nhật ký.

## Điều hướng

| Nhóm | Chức năng | Nguồn / phạm vi |
| --- | --- | --- |
| AI dùng chung | Danh mục model | Registry dùng chung cho Chatbot và COD; bật model không tự đổi model đang chạy |
| Chatbot | Chi phí & API | `ai_chat_requests`; không bao gồm chi phí COD |
| Chatbot | Model & suy luận | Cấu hình toàn bộ Chatbot hoặc riêng theo tài khoản |
| Chatbot | Hạn mức sử dụng | Hạn mức mặc định do API trả về; override theo tài khoản |
| Chatbot | Nhật ký câu hỏi | Câu hỏi, trạng thái và xuất CSV; giữ chức năng retention hiện có |
| COD SMS | Model chấm SMS | `feature=cod_sms`, chỉ phạm vi toàn bộ tác vụ |
| COD SMS | Mốc nâng nghi ngờ | Mốc điểm SMS; không thay đổi điểm đã chấm |
| COD SMS | Lịch chấm SMS | Giờ VN, bật/tắt, lần chạy kế tiếp và audit; Supabase Cron gọi API chấm trên Vercel |
| Tài khoản & truy cập | Phân quyền | RPC và kiểm tra quyền hiện có |
| Tài khoản & truy cập | Lịch sử truy cập | Access logs và presence; xuất cả dữ liệu tải được |

Một danh sách điều hướng thay các tab lồng nhau. Tìm chức năng hỗ trợ tiếng Việt không dấu. Desktop dùng danh sách bên trái; mobile dùng menu thu gọn và đóng sau khi chọn. Mỗi lần đổi chức năng sẽ tải nội dung tương ứng; các bản nháp chưa lưu không được giữ khi chuyển mục.

Form model dùng select lấy lựa chọn từ `allowedModels`, reasoning lấy từ định nghĩa của model. Cấu hình hiệu lực hiện ngay. Nguồn database/env, override và nhật ký model nằm trong các phần mở rộng; COD không hiện bảng override theo tài khoản. Bộ lọc registry nâng cao có chỉ báo khi đang áp dụng.

## Hardcode đã xử lý

- Bỏ hiển thị cố định 10 lượt/ngày và giá trị form 20 lượt: dùng `defaultTurnLimit` do server trả về, giữ nguyên giá trị 0 khi sửa override.
- Chưa tải quota không được hiển thị thành hạn mức đã xác nhận và không cho thêm override mới.
- COD hiển thị đúng `COD_SMS_AI_MODEL` / `COD_SMS_AI_REASONING_EFFORT`, đúng phạm vi và nội dung xác nhận.
- Log thiếu model hiển thị “Chưa ghi nhận model”; không gán vào GPT-5.6 Luna trong chi phí và nhật ký câu hỏi.
- Bỏ giới hạn tải âm thầm 100 trang access logs. Chỉ tải khi mở mục truy cập; phân trang truy vấn có mốc thời gian cố định và thứ tự phụ theo id, hủy request khi rời mục. Bảng hiển thị 50 dòng/trang; xuất CSV dùng toàn bộ dữ liệu đã tải.
- Tổng hợp ngày truy cập dùng giờ Việt Nam, tránh lệch ngày ở ranh giới UTC.
- CSS mới và phần AI được chỉnh dùng token radius hiện có.

Các giá trị 1–9 của điểm SMS, mặc định nghiệp vụ phía server, page size và giới hạn API là các quy tắc/giới hạn có chủ đích. Việc này không di chuyển toàn bộ cấu hình hạ tầng của ứng dụng vào panel.

## Kiểm chứng

- Build production thành công. Vite vẫn cảnh báo các chunk lớn của ứng dụng.
- 34 test liên quan qua: API AI operations, phạm vi và phản hồi cấu hình, ranh giới ngày Việt Nam, log thiếu model.
- Lint các component và utility được sửa không có cảnh báo; file test API có một cảnh báo unused parameter đã có trước.
- Browser Codex `iab` với harness giả lập tách riêng: đã mở đủ 9 chức năng; kiểm tra quota 60, chọn model không có reasoning, nội dung xác nhận COD, bộ lọc registry, tìm email và phân trang truy cập.
- Kiểm tra desktop 1440px và mobile 390px / viewport thực tế. Harness, ảnh và mock nằm trong `output/playwright/dev-panel/`, được gitignore và không có entry trong build production.
- Chưa kiểm tra thao tác ghi với phiên Dev thật hoặc dữ liệu production. Không thay đổi phân quyền, migration hay database production.
