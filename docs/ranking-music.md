# Radio BXH

Nhạc nền của tab BXH chạy như một đài radio: tại mỗi thời điểm, mọi người dùng nghe cùng một bài ở cùng một giây. Chỉ role `dev` được chuyển bài.

## Cách đồng bộ

- Một "mỏ neo" dùng chung trong `public.ranking_radio_state`: `track_id` + `started_at` (giờ server). Không ai đọc/ghi bảng này trực tiếp; client đọc qua RPC `get_ranking_radio()` (kèm `server_now_ms`), dev ghi qua `dev_ranking_radio_play(track_id, offset_seconds)`.
- Từ mỏ neo, thứ tự bài (`sort_order`) và thời lượng (`duration_seconds`), mọi client tự tính ra bài và giây hiện tại: `src/utils/radioSchedule.js` (hàm thuần, có test). Hết bài thì sang bài kế, hết danh sách quay về đầu.
- Client hiệu chỉnh lệch đồng hồ bằng `server_now_ms` (lấy điểm giữa vòng gọi mạng). Mỗi 4 giây khi đang phát, nếu lệch quá 1,5 giây thì tua lại cho khớp.
- Client hỏi lại server mỗi 15 giây (và khi tab được mở lại). Dev đổi bài thì người nghe khác bắt kịp trong tối đa ~15 giây; chính dev thấy ngay.
- Bài chưa có `duration_seconds` không vào lịch phát. Nếu không có bài nào dùng được hoặc Supabase lỗi, widget phát lặp bài mặc định `public/music/how-it-works.mp3` (không đồng bộ).

## Luồng người nghe

1. Vào app, chưa có gì phát: radio chỉ khởi động lần đầu người dùng mở tab BXH (không tốn request trước đó).
2. Vào tab BXH: **mặc định bật âm**. Bấm vào tab là một thao tác của người dùng nên trình duyệt thường cho phát; nếu bị chặn thì widget hiện "Bấm để nghe radio".
3. Widget radio nằm trong BXH (`RankingMusicWidget.jsx`). Chỉ cần tắt âm một lần, lựa chọn được nhớ trong localStorage (`ghn-ranking-radio-muted`); người chưa từng tắt luôn mặc định bật.
4. Chuyển sang tab khác trong app (hoặc chuyển tab trình duyệt, thu nhỏ cửa sổ): nhạc **không dừng**. Một phần phát duy nhất (`RadioProvider.jsx`) nằm ở cấp App nên không bị tháo theo tab.
5. Khi rời BXH với âm đang bật, "màn hình" BXH thu nhỏ lại thành widget nổi (`RadioFloatingLayer.jsx`): một khung tối co dần về vị trí widget rồi widget bật ra. Giảm chuyển động thì widget hiện thẳng, không co.
6. Widget nổi kéo được bằng chuột trái (hoặc phím mũi tên khi đang focus), nhớ vị trí trong localStorage (`ghn-ranking-radio-position`), tự giữ trong khung nhìn khi đổi kích thước cửa sổ. Có nút bật/tắt âm; đĩa nhạc xoay khi đang phát. Tắt âm trên widget thì widget vẫn ở lại để bật lại; vào lại BXH thì widget nổi ẩn đi (widget trong BXH thế chỗ).
7. Người tắt âm lúc rời BXH không có widget nổi (không có gì đang phát để giữ).

## Chi tiết phát

- Bật/tắt âm chỉ ảnh hưởng riêng người nghe; bật lại sẽ vào đúng bài, đúng giây. Âm lượng mặc định 30%.
- Nếu trình duyệt tự dừng phát (giới hạn tài nguyên...), bộ đồng bộ 4 giây sẽ phát lại. Mỗi lần tua để khớp lịch có thời gian chờ 8 giây để mạng chậm không bị tua liên tục.
- Hệ điều hành nhận tên bài (Media Session). Phím media play/pause tương ứng bật/tắt âm của riêng người nghe; chuyển bài từ phím media chỉ dành cho dev.
- Đĩa xoay theo sự kiện phát thực tế, giảm chuyển động dùng đĩa tĩnh.

## Điều khiển (chỉ role `dev`)

- Widget trong BXH có thêm nút bài trước / bài tiếp theo và nút mở bảng điều khiển (`RankingMusicManager.jsx`).
- Bảng điều khiển: bài đang phát với tiến độ, bài trước/sau, danh sách bài (kéo thả hoặc Alt + mũi tên để sắp xếp, đổi tên ngay trên dòng, công tắc bật/tắt khỏi radio, nút "Phát bài này cho mọi người", xóa có xác nhận) và khu kéo thả nhiều file (mp3, m4a, ogg, wav; tối đa 15 MB mỗi file).
- Khi tải lên, trình duyệt đọc thời lượng của file và lưu cùng bài. Bài cũ chưa có thời lượng được đo tự động khi dev mở bảng điều khiển.
- Mọi thay đổi danh sách (thêm, xóa, bật/tắt, sắp xếp) đều "neo lại" radio vào đúng bài và giây hiện tại để người nghe không bị nhảy bài.
- Quyền chặn ở database: `20261013160000_ranking_music_dev_write.sql` và RPC `dev_ranking_radio_play` đều dùng `public.is_dev_admin()` (role `dev` trong `app_user_roles`, không gồm `admin`).

## Dữ liệu và migration

- Bảng `public.ranking_music_tracks` (`title`, `file_path`, `sort_order`, `active`, `duration_seconds`) và bucket public `ranking-music` (`20261013150000_ranking_music_tracks.sql`).
- Cũng có thể thêm bài trong Supabase Dashboard (upload file vào bucket, thêm dòng vào bảng). Nhớ điền `duration_seconds`, hoặc mở bảng điều khiển để app tự đo.
- Hook `useRankingRadio.js`: tải danh sách bài đang bật, mỏ neo, đồng hồ đã hiệu chỉnh (chỉ chạy sau lần đầu mở BXH). `RadioProvider.jsx` giữ thẻ audio và trạng thái phát; `radioContext.js` là context dùng chung cho hai widget.
