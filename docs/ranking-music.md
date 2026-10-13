# Nhạc nền BXH

## Nguồn nhạc

- Danh sách bài lấy từ Supabase: bảng `public.ranking_music_tracks` (migration `supabase/migrations/20261013150000_ranking_music_tracks.sql`).
- File nhạc nằm trong bucket **public** `ranking-music` (tối đa 15 MB/file; mp3, m4a, ogg, wav).
- Hook `src/modules/performance-ranking/useRankingPlaylist.js` đọc các dòng `active = true` theo `sort_order`, dựng URL công khai từ `file_path`. Kết quả được cache một lần cho mỗi lần tải trang.
- Nếu Supabase lỗi hoặc không có bài nào, widget dùng danh sách dự phòng `rankingPlaylist.js` (`public/music/how-it-works.mp3`). Widget chỉ hiện sau khi biết danh sách, nên danh sách đến muộn không làm gián đoạn nhạc đang phát.
- App chỉ có quyền đọc (RLS: anon/authenticated chỉ `select` dòng đang active). Thêm/sửa/xóa làm qua Supabase Dashboard (service role).

## Quản lý trong app (chỉ role `dev`)

- Tài khoản `dev` thấy thêm nút ⚙ trên widget nhạc ở tab BXH, mở `RankingMusicManager.jsx`: tải mp3/m4a/ogg/wav (≤ 15 MB), nghe thử, đổi tên, bật/tắt, đưa lên/xuống, xóa (có xác nhận).
- Quyền được chặn ở database, không phải ở giao diện: migration `20261013160000_ranking_music_dev_write.sql` chỉ cho `public.is_dev_admin()` (role `dev` trong `app_user_roles`, không gồm `admin`) ghi bảng `ranking_music_tracks` và `storage.objects` của bucket `ranking-music`. Dev còn đọc được cả bài đang tắt.
- Tên file khi upload được chuyển thành dạng không dấu, không khoảng trắng và thêm hậu tố để không trùng (`src/utils/rankingMusicFiles.js`). Nếu ghi bảng lỗi sau khi upload, file vừa upload được xóa lại.
- Sau mỗi thay đổi, widget của dev tải lại danh sách và phát từ bài đầu; người dùng khác thấy khi tải lại trang.

## Thêm / đổi bài (Dashboard)

1. Storage → bucket `ranking-music` → Upload file (ví dụ `chill-1.mp3`; nên đặt tên không dấu, không khoảng trắng).
2. Table Editor → `ranking_music_tracks` → Insert row: `title` (tên hiển thị), `file_path` (đúng tên object trong bucket, ví dụ `chill-1.mp3`), `sort_order` (số nhỏ phát trước), `active = true`.
3. Tắt một bài: đặt `active = false`. Người dùng thấy thay đổi khi tải lại trang.

## Hành vi phát

- Widget chỉ hiển thị bài hiện tại, bật/tắt và nút chuyển bài khi có nhiều bài; không hiển thị danh sách.
- Phát theo thứ tự, hết bài chuyển bài kế, hết danh sách quay về đầu. Một bài sẽ lặp.
- Lần đầu tắt âm; nhớ lựa chọn trong localStorage. Khi trình duyệt chặn tự phát, bấm bật để phát.
- Âm lượng mặc định 30%. Rời BXH, tab trình duyệt vào nền hoặc unmount sẽ tạm dừng; quay lại tiếp tục nếu đã bật và trình duyệt cho phép.
- Đĩa xoay theo sự kiện phát thực tế; tạm dừng khi đang tải/tắt âm và giữ góc xoay. Giảm chuyển động dùng đĩa tĩnh.
