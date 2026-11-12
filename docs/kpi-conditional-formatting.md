# Tô màu bảng chi tiết Vùng/Hub

Icon **bảng màu** (tooltip “Tô màu bảng…”) nằm ở thanh công cụ của từng bảng, cạnh nút copy ảnh của bảng ngày mặc định. Cài đặt áp dụng cho các ô tỷ lệ của chỉ số đang chọn ở cả ba chế độ: ngày mặc định (gồm WTD), khoảng ngày và tuần. Không tô màu cột volume hoặc cột chênh lệch so với benchmark.

- **2 màu · Dưới KPI có màu**: màu đầu tại mốc trừ độ rộng; màu cuối tại mốc trở lên. Màu cuối ban đầu là trắng.
- **2 màu · Trên KPI có màu**: màu đầu tại mốc trở xuống; màu cuối tại mốc cộng độ rộng. Màu đầu ban đầu là trắng.
- **Dải 3 màu**: màu thấp tại mốc trừ độ rộng, màu giữa tại mốc, màu cao tại mốc cộng độ rộng.
- **Không tô màu**: giữ nền của cấu trúc bảng, bỏ tô màu KPI.

Chọn trực tiếp một trong 9 mẫu dải màu; chỉnh từng màu ngay bên dưới. Popup rộng 320px ở cạnh phải; bảng cập nhật ngay khi chọn mẫu hoặc chỉnh màu. “Không tô màu” nằm cuối phần lựa chọn. Độ rộng chuyển màu do ứng dụng quản lý (mặc định 5%).

Mọi màu đều chọn được bằng bộ chọn màu hoặc mã hex `#RRGGBB`. Màu chuyển tuyến tính giữa các mốc và giữ màu đầu/cuối ngoài dải; dải giới hạn trong 0–100%. Giá trị được so sau khi làm tròn một chữ số thập phân như tỷ lệ hiển thị. Màu chữ đen/trắng tự chọn để giữ độ tương phản. Ô không có tỷ lệ giữ nền bảng.

Mốc mặc định hiện theo cấu hình bảng: 1st Pickup 97%, OPR 90%, 1st Deli 95%, ODR 90%; FD dùng mốc hiển thị 3% và mặc định tô phía trên. Đây là mốc tô màu, không thay đổi target, số liệu, công thức KPI hay quy tắc nghiệp vụ theo khách hàng.

**Lưu cài đặt** giữ lựa chọn cho lần sau; bảng hiển thị bản nháp ngay trong lúc chỉnh. **Hủy**, click bên ngoài và Escape bỏ bản nháp. **Mặc định** đưa bản nháp về đúng cách tô theo bậc có sẵn của ứng dụng. Trước lần lưu đầu tiên, bảng vẫn dùng cách tô màu có sẵn.

Cài đặt lưu trong localStorage, khóa `ghn:kpi-formatting:v1:<email đã chuẩn hóa>`, tách riêng từng tài khoản và từng KPI. Tải lại trang và đăng nhập lại cùng tài khoản trên cùng trình duyệt sẽ khôi phục. Thay đổi ở tab khác cùng origin được đồng bộ qua sự kiện storage. Chưa đồng bộ giữa các thiết bị/trình duyệt; xóa dữ liệu trình duyệt sẽ mất cài đặt. Nếu không lưu được, bảng giữ lựa chọn cũ và bộ chỉnh báo lỗi để thử lại.

PUD của SPE Reverse mặc định vẫn trung tính (chưa có target) nhưng có nút bảng màu như các KPI khác; mốc tô màu mặc định 70% chỉ là mốc hiển thị, không phải target. Tab Backlog (số đơn tuyệt đối) có nút bảng màu riêng: tô cột Δ (tăng/giảm), tô mức tồn theo cấp (nhạt → đậm so với giá trị lớn nhất cùng cấp và cùng ngày), cả hai hoặc không tô; lưu ở khóa `ghn:backlog-formatting:v1:<email>`.

Chức năng chỉ đọc dữ liệu đã có, không gọi DB khi mở/chỉnh/lưu. Trang snapshot tự động dùng quy tắc màu có sẵn, độc lập với lựa chọn cá nhân.

## Trạng thái hiện tại

Khi chưa lưu lựa chọn cá nhân, tool đánh dấu **Mặc định ứng dụng**: dùng đúng cách tô theo bậc và màu chữ của bảng hiện có. Mở tool không chuyển sang dải chuyển sắc. Nút Mặc định cũng trả về cách tô này.

Khi mở, dòng **Đang chọn** cùng dấu tick cho biết đang dùng mặc định, mẫu dải màu, tùy chỉnh hoặc không tô màu. Màu tùy chỉnh không trùng mẫu có một dòng riêng kèm mẫu màu đang dùng. Lựa chọn đã lưu trước đây được giữ nguyên.
