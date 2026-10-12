# Nhạc nền BXH

- File nhạc: `public/music/how-it-works.mp3` (bản sao nguyên vẹn từ file người dùng).
- Danh sách nội bộ: `src/modules/performance-ranking/rankingPlaylist.js`.
- Để thêm bài: đặt file vào `public/music/`, thêm `{ id, title, src: `${import.meta.env.BASE_URL}music/ten-file.mp3` }` vào danh sách. `id` phải duy nhất.
- Widget chỉ hiển thị bài hiện tại, bật/tắt và nút chuyển bài khi có nhiều bài; không hiển thị danh sách.
- Phát theo thứ tự, hết bài chuyển bài kế, hết danh sách quay về đầu. Một bài sẽ lặp.
- Lần đầu tắt âm; nhớ lựa chọn trong localStorage. Khi trình duyệt chặn tự phát, bấm bật để phát.
- Âm lượng mặc định 30%. Rời BXH, tab trình duyệt vào nền hoặc unmount sẽ tạm dừng; quay lại tiếp tục nếu đã bật và trình duyệt cho phép.
- Đĩa xoay theo sự kiện phát thực tế; tạm dừng khi đang tải/tắt âm và giữ góc xoay. Giảm chuyển động dùng đĩa tĩnh.
