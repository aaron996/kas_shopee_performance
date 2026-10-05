# Phân quyền app: Dev / Admin / User

| Chức năng | Dev | Admin | User |
| --- | --- | --- | --- |
| Báo cáo thông thường | Có | Có | Có |
| COD nâng cao, SMS nguyên văn, giải thích điểm, lịch sử batch | Có | Có | Không |
| COD đã kết luận không vi phạm | Có | Có | Không |
| Chấm điểm SMS thủ công, xử lý/kết luận COD | Có | Không | Không |
| Dev panel, cấu hình AI/SMS, phân quyền tài khoản | Có | Không | Không |

Role lưu trong `public.app_user_roles`. Tài khoản chưa có bản ghi mặc định là `user`.
Các bản ghi `dev` hiện có được giữ nguyên. Tên hiển thị cũ Dev Admin đổi thành Dev;
các định danh nội bộ như `is_dev_admin`, `isDevAdmin`, `dev-admin` được giữ để tương thích.

## Đưa lên môi trường

1. Áp dụng migration `20261005080000_app_dev_admin_user_roles.sql` trước frontend/API.
2. Deploy frontend/API rồi kiểm tra bằng ba phiên đăng nhập riêng cho Dev, Admin, User.
3. Dev mở **Dev → Phân quyền**, tìm email đã đăng nhập, chọn role và **Lưu quyền**.
   Migration không tự cấp Admin cho tài khoản nào.
4. Kiểm tra Admin xem SMS nhưng API chấm điểm/phân quyền trả 403; User không thấy view nâng cao.

RPC đổi role kiểm tra quyền Dev trong database, role cũ để tránh ghi đè thay đổi từ
phiên khác, chặn tự hạ quyền và hạ Dev cuối cùng. Mỗi thay đổi được ghi vào
`app_user_role_audit`. Danh sách tìm theo email, 50 tài khoản mỗi trang; chỉ bao gồm
tài khoản đã đăng nhập thuộc miền được app cho phép.

Phiên đang mở đọc lại role khi cửa sổ nhận focus và mỗi 60 giây khi trang hiển thị.
API/RLS kiểm tra quyền hiện tại cho mỗi yêu cầu. Giao diện COD được dựng lại và cache
được tách theo tài khoản/role để tránh dùng dữ liệu nâng cao của phiên trước.

## Kiểm tra tại local

`npm test` kiểm tra API và thực thi migration bằng PostgreSQL nhúng PGlite:
quyền đọc COD, RPC phân quyền, ghi trực tiếp bị từ chối, audit, tự hạ quyền,
Dev cuối cùng và xung đột role. `npm run build` kiểm tra bundle.
Browser QA dùng component thật với tài khoản/dữ liệu giả lập trong built-in browser;
không thay thế kiểm tra phiên đăng nhập trên môi trường đã áp dụng migration.
