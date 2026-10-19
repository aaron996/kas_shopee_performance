# Thống kê sử dụng app

Trong **Dev → Tài khoản & truy cập → Lịch sử truy cập → Sử dụng app**:

- Chọn Hôm nay, Hôm qua, 7/30 ngày hoặc khoảng tùy chọn tối đa 90 ngày theo giờ Việt Nam; lọc tài khoản và tab báo cáo.
- Xem số người hoạt động, phiên, thời gian hoạt động, trung bình mỗi phiên.
- Bấm ngày trên biểu đồ hoặc bảng ngày để xem đúng danh sách user ngày đó. Biểu đồ giữ toàn khoảng đang chọn; KPI, xếp hạng tab và bảng user cùng lọc theo ngày.
- Bấm tab để lọc người đã xem tab đó; số phút và lượt xem chỉ tính trong tab được lọc.
- Bấm email để mở chi tiết user: lần đầu/gần nhất, thời gian từng tab, hành động và tối đa 100 phiên gần nhất. Đây là danh sách tab đã xem, không phải thứ tự chuyển tab.
- Desktop mở chi tiết cạnh bảng ở màn rộng; mobile mở riêng và có nút quay lại, giữ bộ lọc. Escape đóng chi tiết và focus trở về email.
- Tìm email, sắp xếp gần nhất/thời gian/số phiên, phân trang 20 người. Xuất CSV gồm tất cả dòng đang lọc tìm kiếm, không chỉ trang hiện tại; file ghi rõ phạm vi ngày và tab.
- Đếm câu hỏi chatbot được API tiếp nhận và lượt export thành công qua hộp thoại Tải CSV (báo cáo Vùng/Hub, Ca 1). CSV thống kê kèm hai cột hành động theo từng dòng. Không đại diện mọi kiểu download trong app.
- CSV chỉ xuất danh sách đã tải và đang lọc; bấm xuất không truy vấn DB.
- Mục **Lịch sử cũ & online** giữ nguyên log truy cập trước đây và presence hiện tại.

## Quy ước đo

- Chỉ ghi nhận tài khoản Supabase hợp lệ sau màn giới thiệu và chọn client. Local preview không ghi telemetry.
- Thời gian chỉ cộng khi document visible và có focus, dừng sau 2 phút không có pointer/keyboard/scroll/touch. Đọc thụ động quá 2 phút có thể bị tính thiếu; đây không phải số đo năng suất.
- Một phiên tương ứng một lần tải app, hoặc lần trở lại sau 30 phút không tương tác. Đổi tab báo cáo giữ nguyên phiên. Tải lại hoặc mở tab trình duyệt khác tạo phiên mới.
- Chỉ một cửa sổ có focus được cộng thời gian. Số phiên/người xem theo tab không cộng trực tiếp thành tổng app vì cùng một phiên có thể xem nhiều tab.
- Qua nửa đêm, thời gian tách theo ngày Việt Nam; phiên vẫn giữ nguyên. Tổng phiên trong kỳ đếm distinct, không cộng tổng từng ngày.
- Gửi bản cộng dồn mỗi 30 giây, khi ẩn app và khi đóng trang. Retry dùng phép greatest nên không cộng trùng. Không lưu nội dung báo cáo, câu hỏi chatbot, phím bấm, dữ liệu đơn hàng hoặc replay màn hình.
- Offline retry trong bộ nhớ, tối đa 64 bản cộng dồn. Dữ liệu chưa gửi có thể mất khi đóng app; keepalive là best effort. Clock jump/suspend trên 45 giây không được tính thành thời gian hoạt động.
- Không suy thời gian/tab lịch sử từ `access_logs` cũ. Mốc bắt đầu ghi nhận được hiển thị từ dữ liệu mới.

## Kích hoạt

Đã áp dụng hai migration lên Supabase **KAS GHN**, project `iyjsihwgnzcytbojvoom`, ngày 16/10/2026. Tên file local khớp version Supabase ghi nhận:

1. `supabase/migrations/20261016080518_app_usage.sql`: bảng PostgreSQL **không partition**, index ngày/email, RLS và RPC ghi/đọc cơ bản.
2. `supabase/migrations/20261016080523_app_usage_monitor.sql`: RPC đọc cho layout Monitor; không thay đổi writer hoặc dữ liệu cũ.

Telemetry thực tế bắt đầu được gửi sau khi frontend chứa thay đổi này được triển khai; không có dữ liệu hồi tố trước mốc triển khai.

- `record_app_usage`: chỉ authenticated; server lấy user ID/email từ JWT và kiểm tra chính sách email. Client không truyền được danh tính khác. Chỉ chấp nhận hôm nay/hôm qua, timestamp hợp lệ và thời gian hoạt động không vượt thời gian đã trôi qua.
- `dev_app_usage`: chỉ role Dev qua `is_dev_admin()`, trả tổng hợp 7/30 ngày có filter ngày và email; không tải toàn bộ raw rows về browser.
- `dev_app_usage_monitor`: chỉ Dev; khoảng ngày bắt buộc tối đa 90 ngày, không cho ngày tương lai; lọc email, tab và ngày trong khoảng. Option tài khoản/tab lấy từ toàn khoảng nên không mất lựa chọn khi đang lọc. Chi tiết user gọi cùng RPC với email và phạm vi hiện tại.

Frontend báo rõ khi thiếu migration; tracker ngừng retry khi RPC chưa tồn tại hoặc quyền bị từ chối. Migration không đổi dữ liệu hay quyền của log cũ. Không có job xóa dữ liệu tự động trong thay đổi này.

## Kiểm tra

`node --test src/utils/appUsageMonitor.test.mjs src/utils/appUsageTracker.test.mjs src/utils/devAccessActivity.test.mjs tests/api/app-usage-db.test.mjs`: 13/13 kiểm tra đạt (16/10/2026). Bao gồm idle/focus, đổi tab, phiên/nửa đêm, RPC/RLS/identity/retry, scope ngày-tab-email, option, ngày chưa tracking, khoảng tùy chỉnh, tìm/sắp xếp và CSV. PostgreSQL logic chạy cục bộ bằng PGlite.

Trên Supabase đã xác nhận metadata bảng không partition, RLS bật, policy đọc chỉ Dev, `anon` không execute được hai RPC mới. Reader chạy được với danh tính Dev mô phỏng trong transaction read-only; danh tính user thường mô phỏng bị từ chối. Đây là kiểm tra SQL với claims mô phỏng, chưa phải đăng nhập browser thật. Bảng mới chưa có telemetry thực tế ở thời điểm xác nhận.

Đã thử writer hai lần cùng session/tab bằng dữ liệu tổng hợp trong một transaction rồi rollback: reader trả 1 người, 1 phiên, 1 lượt xem, 15.000 ms (không cộng trùng). Sau rollback xác nhận `app_usage` còn 0 dòng; không giữ dữ liệu kiểm tra trong production.

Security Advisor báo nhóm `authenticated_security_definer_function_executable` cho các RPC có chủ đích: writer tự lấy identity từ JWT, reader kiểm tra Dev trong body và đã có kiểm tra từ chối user thường. Không coi kết quả advisor là hoàn toàn sạch; các cảnh báo trên hệ thống khác được giữ ngoài phạm vi. [Giải thích nhóm cảnh báo](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

IAB fixture `output/app-usage-qa/index.html` dùng dữ liệu minh họa, không tạo session hoặc gửi telemetry. Đã kiểm tra chọn ngày 15/10 chỉ có An/Vinh, ngày 16/10 + BXH chỉ có An, giữ scope khi mở/đóng user, tìm không khớp, phân trang, khoảng tùy chỉnh, mobile 390px không tràn ngang, trạng thái rỗng/lỗi/thử lại và CSV tải thực tế khớp scope. Kiểm tra phát hành ngày 19/10/2026 trên nhánh tách từ `origin/main` mới nhất: toàn bộ 710/710 test đạt, build đạt, lint không có lỗi (còn các warning sẵn có trong repo).
