# Rà soát cache trong app — 07/10/2026

## Kết quả và thay đổi

Dev Panel trước đây hủy component khi chuyển chức năng. Mỗi lần quay lại đều
gọi API/RPC, kể cả dữ liệu vừa tải xong. Bản sửa dùng cache RAM chung có thời
hạn 60 giây, tối đa 64 kết quả. Không lưu dữ liệu quản trị vào localStorage
hay IndexedDB.

| Luồng | Hiện trạng / xử lý |
|---|---|
| Báo cáo KPI, Ca 1, leadtime, FD | Snapshot chung nằm ở App, có IndexedDB và đồng bộ nền; đổi tab không tải lại nguồn. Giữ cơ chế hiện có. |
| COD suspicion | Cache snapshot 5 phút theo email/quyền; module giữ mounted. Giữ cơ chế hiện có. |
| Chi tiết SMS | Có cache riêng theo tài khoản/quyền và case; giữ cơ chế hiện có. |
| Gợi ý Chatbot | Có cache 10 phút theo ngữ cảnh; giữ cơ chế hiện có. |
| Quota Chatbot | Kiểm tra khi mở chat để giữ thông tin hạn mức hiện tại; không thêm cache. |
| Dev: cấu hình Chatbot / COD SMS | Cache riêng theo feature và user đích; làm mới bỏ qua cache. |
| Dev: danh mục model | Cache danh mục; mọi thao tác POST, kể cả probe lỗi có lưu trạng thái, xóa cache. |
| Dev: chi phí, quota, nhật ký câu hỏi | Cache theo URL đầy đủ, gồm ngày, bộ lọc, từ khóa; bỏ phản hồi đã hủy khi đổi bộ lọc. |
| Dev: phân quyền | Cache theo từ khóa và trang; đổi quyền xóa cache rồi đọc lại. RPC vẫn kiểm tra quyền trên server. |
| Dev: lịch sử truy cập | Cache toàn bộ kết quả phân trang cùng thời điểm cập nhật; online users vẫn lấy từ presence hiện tại. |
| Dev: ngưỡng điểm SMS | Cache trong Dev Panel; lưu/khôi phục xóa cache. Đường đọc ngưỡng của báo cáo COD giữ nguyên. |

Panel giữ mục đang chọn khi rời/quay lại module. Nội dung mục không hoạt động
được unmount; quay lại lấy dữ liệu còn hạn từ cache. Cách này không giữ form
ẩn đang chỉnh sửa và không tạo listener/polling cho mọi chức năng chưa mở.

## Quy tắc cache

- Key gồm ID/email tài khoản, quyền và tài nguyên đầy đủ. Cache chỉ tối ưu đọc;
  kiểm tra session vẫn chạy trước mỗi lần đọc và server vẫn quyết định quyền.
- Các yêu cầu đồng thời cho cùng key dùng chung một promise. Hủy một consumer
  không hủy yêu cầu mà consumer khác đang cần.
- Chỉ kết quả thành công được lưu. Hết 60 giây, lần đọc kế tiếp gọi nguồn mới.
- Nút Tải lại / Làm mới và retry chủ động bỏ qua cache.
- Mọi ghi AI API xóa cache trước và sau thao tác; đổi quyền và lưu ngưỡng cũng
  xóa cache. Kết quả đọc cũ không được ghi lại cache sau khi đã invalidation.
- Thay đổi phiên đăng nhập/token và unmount panel do mất quyền/đổi danh tính
  xóa cache. Warm module vẫn được kiểm tra quyền Dev, kể cả khi đang ẩn.
- CSV export và workflow xử lý COD vẫn đọc trực tiếp; không cache thao tác ghi.

## Kiểm chứng

- Unit tests kiểm tra TTL, dedup, force refresh, thất bại, invalidation khi còn
  request, hủy consumer, phân tách key và giới hạn bộ nhớ.
- Tests client kiểm tra session, đọc API/RPC, đổi danh tính/quyền, bỏ cache sau
  ghi thành công và sau probe thất bại.
- Browser Codex (`iab`) với fixture API/RPC, độ trễ giả lập 600 ms: mở lần đầu
  9 chức năng tương ứng 9 lần tải; đi lại qua cả 9 chức năng không tăng bộ đếm.
  Tải lại cấu hình Chatbot tăng riêng bộ đếm Chatbot từ 1 lên 2.
- Browser fixture cũng xác nhận rời/quay lại panel giữ mục và dùng cache;
  nút tải lại Phân quyền tăng đúng một yêu cầu.
- Lưu ngưỡng SMS trong fixture rồi quay lại cấu hình Chatbot: dữ liệu cấu hình
  được tải mới, xác nhận thao tác ghi làm mất hiệu lực cache.
- Kiểm tra cuối: 497/497 tests qua; lint các file thay đổi không có cảnh báo;
  build production qua (vẫn có cảnh báo chunk lớn hơn 500 kB); diff check qua.

Đây là bằng chứng local và fixture. Bản local thật đang ở màn hình đăng nhập,
chưa kiểm chứng phiên Dev thật, API production hoặc thời gian chờ production.
Fixture QA nằm trong `output/playwright/` (gitignored), không nằm trong app build.
