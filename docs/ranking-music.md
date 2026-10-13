# Radio BXH

Nhạc nền của tab BXH chạy như một đài radio: tại mỗi thời điểm, mọi người dùng nghe cùng một bài ở cùng một giây. Chỉ role `dev` được chuyển bài.

## Cách đồng bộ

- Một "mỏ neo" dùng chung trong `public.ranking_radio_state`: `track_id` + `started_at` (giờ server). Không ai đọc/ghi bảng này trực tiếp; client đọc qua RPC `get_ranking_radio()` (kèm `server_now_ms`), dev ghi qua `dev_ranking_radio_play(track_id, offset_seconds)`.
- Từ mỏ neo, thứ tự bài (`sort_order`) và thời lượng (`duration_seconds`), mọi client tự tính ra bài và giây hiện tại: `src/utils/radioSchedule.js` (hàm thuần, có test). Hết bài thì sang bài kế, hết danh sách quay về đầu.
- Client hiệu chỉnh lệch đồng hồ bằng `server_now_ms` (lấy điểm giữa vòng gọi mạng). Mỗi 4 giây khi đang phát, nếu lệch quá 1,5 giây thì tua lại cho khớp.
- Client hỏi lại server mỗi 15 giây (và khi tab được mở lại). Dev đổi bài thì người nghe khác bắt kịp trong tối đa ~15 giây; chính dev thấy ngay.
- Bài chưa có `duration_seconds` không vào lịch phát. Nếu không có bài nào dùng được hoặc Supabase lỗi, widget phát lặp bài mặc định `public/music/how-it-works.mp3` (không đồng bộ).

## Nghe

- Phát khi chuyển tab trình duyệt hoặc thu nhỏ cửa sổ. Rời tab BXH trong app vẫn tạm dừng (widget gắn với tab BXH). Nếu trình duyệt tự dừng thì sẽ phát lại khi quay lại tab.
- Mỗi người chỉ có công tắc bật/tắt âm của riêng mình (lưu trong localStorage, mặc định tắt). Tắt âm không làm lệch radio: bật lại sẽ vào đúng bài, đúng giây. Khi trình duyệt chặn tự phát, bấm bật để nghe.
- Âm lượng mặc định 30%. Hệ điều hành chỉ nhận tên bài (Media Session); tua/chuyển bài từ phím media chỉ dành cho dev.
- Đĩa xoay theo sự kiện phát thực tế, giảm chuyển động dùng đĩa tĩnh.

## Điều khiển (chỉ role `dev`)

- Widget có thêm nút bài trước / bài tiếp theo và nút mở bảng điều khiển (`RankingMusicManager.jsx`).
- Bảng điều khiển: bài đang phát với tiến độ, bài trước/sau, danh sách bài (kéo thả hoặc Alt + mũi tên để sắp xếp, đổi tên ngay trên dòng, công tắc bật/tắt khỏi radio, nút "Phát bài này cho mọi người", xóa có xác nhận) và khu kéo thả nhiều file (mp3, m4a, ogg, wav; tối đa 15 MB mỗi file).
- Khi tải lên, trình duyệt đọc thời lượng của file và lưu cùng bài. Bài cũ chưa có thời lượng được đo tự động khi dev mở bảng điều khiển.
- Mọi thay đổi danh sách (thêm, xóa, bật/tắt, sắp xếp) đều "neo lại" radio vào đúng bài và giây hiện tại để người nghe không bị nhảy bài.
- Quyền chặn ở database: `20261013160000_ranking_music_dev_write.sql` và RPC `dev_ranking_radio_play` đều dùng `public.is_dev_admin()` (role `dev` trong `app_user_roles`, không gồm `admin`).

## Dữ liệu và migration

- Bảng `public.ranking_music_tracks` (`title`, `file_path`, `sort_order`, `active`, `duration_seconds`) và bucket public `ranking-music` (`20261013150000_ranking_music_tracks.sql`).
- Cũng có thể thêm bài trong Supabase Dashboard (upload file vào bucket, thêm dòng vào bảng). Nhớ điền `duration_seconds`, hoặc mở bảng điều khiển để app tự đo.
- Hook `useRankingRadio.js`: tải danh sách bài đang bật, mỏ neo, đồng hồ đã hiệu chỉnh. Widget: `RankingMusicWidget.jsx`.
