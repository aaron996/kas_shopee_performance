# CSGT T2 v1 — kiểm tra chất lượng 29/10/2026

## Kết luận

Giữ làm model nền cho cảnh CSGT ngồi lái sau một lượt sửa asset. Chưa duyệt đưa thẳng vào runtime; chưa đạt cho animation xuống xe/đi bộ/kiểm tra giấy tờ. Không cần kết luận phải gen lại toàn bộ: hình dáng, trang phục và xe đã có thể dùng làm nền.

## Phạm vi và bằng chứng

- Blender 5.2.1 LTS headless, factory startup; không tác động phiên Blender của người dùng.
- Nguồn `../meshy-t2/model.glb`, SHA-256 `8ACBC25E7344ABAD001EE0C2D3C53E124DE7C6A3F3E361E90F3B641DC749C386`.
- Render sáu góc với texture; silhouette/matcap/wire bốn góc; cô lập 12 cụm lớn; kiểm tra riêng cụm người và hai cụm bánh tại 0/45 độ.
- `neutral-sheet.png`: sáu góc cuối, hàng trên trước/sau/hông A, hàng dưới hông B/chéo trước/chéo sau. Tên front/back của lượt `texture-sheet.png` ban đầu chỉ là hướng trục, không dùng làm nhãn mặt xe.
- `style-comparison.png`: CSGT và rider GHN runtime dưới cùng ánh sáng, chuẩn hóa chiều dài để so phong cách; không phải tỷ lệ kích thước cuối cùng trong game.
- `officer-isolated-sheet.png`: cụm người lớn nhất cộng mũ, cho thấy phần xe đang dính theo.
- `front-wheel-test.png`, `rear-wheel-test.png`: nhóm thử nghiệm quay 0/45 độ, chưa phải file runtime có pivot.
- File nguồn không được ghi đè; `csgt-audit.blend` chứa bản nguồn nhập vào và các bản chẩn đoán ẩn.

## Đánh giá theo mục tiêu

| Tiêu chí | Kết quả |
| --- | --- |
| Nhận diện CSGT và mô tô | Đạt sơ bộ: có đủ người, mũ, thân xe, hai bánh, kính, thùng hông; không thấy mất bộ phận lớn trong sáu góc |
| Phong cách so với rider GHN | Khá phù hợp ở mức asset nhỏ; người/xe vẫn hơi mềm và texture kém gọn hơn concept |
| Tài nguyên | 10.638 tam giác, khoảng 3,2 MB, 1 material, 1 ảnh nhúng 2048×2048; cùng bậc độ phức tạp với rider hiện có. Chưa đo hiệu năng trong scene |
| Quay bánh | Khả thi: nhóm thử bánh trước 860 tam giác/8 cụm, bánh sau 794 tam giác/6 cụm; đã render ở 0 và 45 độ |
| Tách nhân vật | Chưa đạt: cụm thân người dính cả tay lái, một phần phuộc trước và các mảng/chi tiết xe; mũ là cụm riêng |
| Animation người | Chưa đạt: không armature, skin hay clip; topology chưa được kiểm tra biến dạng |
| Sẵn sàng runtime | Chưa đạt: cần sửa hình/texture, chuẩn hóa tỷ lệ/hướng/ground, tạo nhóm bánh và pivot, kiểm tra lại trong scene thực |

## Lỗi cần xử lý

1. **Phần xe dính vào người:** cụm lớn nhất còn chứa tay lái/phuộc và mảng đen kéo vào vùng tay–bụng/chân. Cần tách bằng lựa chọn mặt và sửa bề mặt nếu muốn tái sử dụng người. Không thể dùng Separate Loose Parts để có người sạch ngay.
2. **Bàn tay và vùng tay lái:** hình học mảnh/rối, ngón tay không rõ; cần gọn lại khi chuẩn bị asset, nhất là nếu có camera theo xe.
3. **Đèn:** model có hai đèn đỏ; concept yêu cầu một đỏ/một xanh. Cần chỉnh material/texture hoặc thay đèn bằng mesh đơn giản.
4. **Kính chắn gió:** gần như đặc màu xanh, che người ở góc trước. Cần quyết định kính trong hoặc kính cách điệu có độ che phù hợp với scene.
5. **Texture lốp:** có mảng trắng trên lốp trước, mép vành/lốp sau bị loang; dễ nhận ra khi bánh quay. Sửa texture/mask cao su trước khi duyệt.
6. **Texture đồng phục/huy hiệu:** cổ áo và chi tiết nhỏ bị lem, không sạch như concept; làm gọn các mảng màu nếu dùng góc gần.

## Kiểm tra topology và giới hạn

- Nguồn: 11.409 vertex; 10.638 face tam giác; không có face diện tích bằng 0, loose vertex/edge hoặc winding bất nhất theo audit.
- GLB có nhiều vertex trùng ở UV/normal seam. Không coi số vertex trùng hoặc biên hở thô là lỗi bề mặt trực tiếp.
- Bản chẩn đoán weld ở khoảng 1e-6 chiều dài có 5.627 vertex, 10.637 face, 91 cụm rời và 23 nhóm biên/327 cạnh biên. Weld làm mất một face suy biến ở tolerance này; chỉ dùng để chẩn đoán, không xuất làm runtime.
- Audit BVH báo nhiều cặp mặt có thể chồng nhau; chưa phân biệt hết tiếp xúc/coplanar giữa các bộ phận với xuyên bề mặt. Không dùng con số đó như số lỗi hình học đã xác nhận.
- Nhóm bánh là lựa chọn dựa trên phạm vi hình học và kiểm tra render cô lập; chưa đo độ lắc trong vòng quay đủ 360 độ hoặc chứng minh không thiếu/thừa từng mặt trong GLB runtime.
- Chưa có kiểm thử biến dạng, chạy trong BXH, FPS trên thiết bị thật hoặc duyệt mỹ thuật của người dùng.

## Hướng tiếp theo

Ưu tiên sửa bản hiện tại cho cảnh ngồi lái: dọn hình học thừa, sửa tay/đèn/kính/texture lốp, tạo thân + hai nhóm bánh và pivot. Sau đó xem tại camera BXH trước khi duyệt. Nếu làm xuống xe/đi bộ, cần một lượt tách/sửa nhân vật riêng, rig và thử biến dạng; chưa tự phát sinh job Meshy mới.
