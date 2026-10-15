# BXH 3D — GHN World Route

## Hướng đã triển khai

BXH có sáu vùng cảnh: Miền Tây, Rừng mưa, Alps, Cảng biển, Hồ Chí Minh và Hà Nội. Đây là bối cảnh cách điệu cho đoàn xe GHN, không mô phỏng bản đồ hay thông tin về mạng lưới GHN ở nước ngoài. Scene giữ thứ hạng, Hub identity, Best/Worst, replay và picking của hệ BXH hiện có.

Ưu tiên phiên xem ngắn trên laptop/điện thoại: vùng xuất hiện hoàn chỉnh khi vào scene. Dropdown chọn vùng, nút ghim vùng yêu thích và hành trình tự động dùng chung khu điều khiển cảnh. Điện thoại chỉ có chọn/ghim; tự chuyển là tùy chọn desktop và mặc định tắt.

| Vùng | Hình dáng / cơ sở GHN | Chuyển động |
|---|---|---|
| Miền Tây | Mesa đá tầng, xương rồng, hàng rào gỗ; bưu cục gỗ mái dốc | Tumbleweed lăn/nảy nhẹ, mây và kiện hàng ở hiên |
| Rừng mưa | Tán lá rộng, dương xỉ, dòng nước; bưu cục nền nâng, mái che rộng | Tán/lá khác pha theo gió, mặt nước và kiện hàng |
| Alps | Núi có mảng tuyết, thông, đá; bưu cục chân đá mái gỗ | Cây/cỏ theo gió, mây và kiện hàng |
| Cảng biển | Mặt nước, tàu xa, cẩu và container; cơ sở mái loading cam | Cáp/container nâng hạ đồng bộ, sóng nhẹ |
| Hồ Chí Minh · HCM4 | Phố thương mại với nhà ống 2–4 tầng, cửa kính, mini mart, tiệm điện thoại, cà phê, cơm tấm/hủ tiếu; Landmark 81, Bitexco và sông ở lớp sau | Nước, tán cây, mây |
| Hà Nội · HN2 | Dãy cà phê, nhà sách, hàng phở và kem quanh Hồ Gươm; Tháp Rùa, cầu Thê Húc và mái Ngọc Sơn phía sau | Nước, tán cây, mây |

Các địa hình là mesh cách điệu dùng chung, có outline được chỉnh theo vùng; các cơ sở được ghép module và batch cùng props. Bản runtime có mật độ/chi tiết thấp hơn ảnh concept AI. Chưa thêm một hệ thời tiết mưa/tuyết, xe nâng có đường chạy hoặc camera mở đầu mới.

Hai cảnh thành phố dùng `sceneCityLayout.js` và `sceneCityStreet.js`. Công trình biểu tượng ghép theo cụm 96 đơn vị; dãy cửa hàng dùng anchor nhỏ cách nhau 6 đơn vị để bám đường cong và phủ liên tục cả hai bên. Vỉa hè hẹp có bàn ghế, xe đẩy, xe máy, chậu cây và người cách điệu. Các quầy gần camera có tường thấp, mái và mái hiên để lấp lề trống mà vẫn nhìn được xe. Compact giữ nguyên số cửa hàng, giảm ban công, cây, người và chi tiết. Palette, nền bê tông từ atlas, dropdown, ghim và hành trình tự động dùng chung cơ chế vùng hiện có. Thứ tự hành trình: Miền Tây → Rừng mưa → Alps → Cảng biển → Hồ Chí Minh → Hà Nội.

Người dùng đã chọn **HN2 – Hồ Gươm** và **HCM4 – Phố thương mại** từ hai bảng concept trong `output/imagegen/city-options-v1/`. Hai hướng này thay bố cục công trình rời ban đầu; Bến Thành và Khuê Văn Các không còn là điểm nhấn trong bản đã chọn. HN2 ưu tiên quán thấp ven hồ và mái ngói; HCM4 dùng phố nhà ống xen cửa hàng kính, mái bằng và skyline. Bản runtime là mô hình WebGL cách điệu, không phải tái tạo từng chi tiết hay chất lượng ảnh AI. Biểu tượng nhìn thấy thay đổi theo đoạn đường, thời điểm và camera.

Tham chiếu nhận diện kiến trúc: [Vietnam Tourism – TP.HCM](https://vietnam.travel/places-to-go/southern-vietnam/ho-chi-minh-city/), [Vietnam Tourism – Hà Nội](https://vietnam.travel//things-to-do/11-must-see-attractions-ha-noi), [Vietnam Tourism – di sản Hà Nội](https://vietnam.travel/node/1463). Các công trình là mô hình gợi nhận diện, đã nén tỷ lệ và vị trí để phù hợp camera BXH.

## Vật liệu

`public/textures/world-surfaces-v1.png` là atlas albedo 1536×1024 được tạo bằng Imagegen ngày 13/10/2026: sáu ô đất khô, đất rừng, cỏ, bê tông, nhựa đường, gỗ. Các vật thể chia sẻ một texture; không phát sinh ảnh theo Hub. Shader dùng gradient cho sampling ô atlas và một lượng bump nhỏ trên đường; màu/texture nền blend cùng vùng. Đá/gỗ/bê tông lấy chi tiết từ atlas và giữ palette riêng.

Nguồn atlas: `C:\Users\admin\.codex\generated_images\01a13546-dbe3-7cd2-bf12-a1e4ae856e80\exec-9deecf3e-5dde-4870-b42e-f639165c4b63.png`. File được copy vào repository; ứng dụng không phụ thuộc đường dẫn ngoài workspace. PNG hiện khoảng 4,43 MB và dùng chung qua cache loader.

Biển hàng quán dùng một CanvasTexture atlas 2048×512, 16 ô chữ Việt (cà phê, phở, bánh mì, mini mart, v.v.) chia sẻ theo instance. Kênh màu và phát sáng dùng cùng UV của ô; mesh/màu/texture được dispose theo vòng đời cảnh. Mái hiên dùng shader sọc có chống răng cưa; kính cửa hàng dùng mảng sạch, tách khỏi chi tiết tầng của kính cao ốc.

GLB xe và texture nhúng không bị sửa. Shader nâng phản ứng kính/sơn/nóc/lốp, làm mép dải Hub có chống răng cưa, giảm bão hòa nhận diện và dùng mipmap/anisotropy cho glyph. Beacon trạng thái nhận ánh sáng qua vật liệu standard. Một môi trường phản chiếu PMREM dùng chung với cường độ theo ngày/đêm; tạo trong effect để có cleanup đúng dưới StrictMode.

## Vòng đời và tương tác

- Chuyển vùng blend trong 1,6 giây mô phỏng. Luôn tối đa hai vùng trong quá trình blend và một vùng khi hoàn tất. Chọn liên tiếp giữ destination mới nhất sau khi lượt blend đang chạy kết thúc.
- Xe/camera/Hub đang chọn không remount theo vùng. Đổi KPI, Best/Worst hoặc Top N không reset vùng.
- Khi pause hoặc reduced motion, lựa chọn vùng chủ động áp dụng ngay. Pause giữa blend đóng băng tiến trình; resume tiếp tục. Hidden document không tiến hành trình.
- Desktop tự chuyển sau 55 giây đang xem nếu bật. Thời gian chờ không nhân theo playback rate, được reset khi đang tour/chọn Hub/hover xe/giữ pointer. Ghim vùng hoặc chuyển sang mobile tắt hành trình tự động.
- `ghn-ranking-world-pin` trong localStorage giữ vùng yêu thích. Nếu không ghim, sessionStorage `ghn-ranking-world-next` lưu vùng tiếp theo cho lần mount mới. Các thao tác trong scene giữ nguyên vùng.
- Cụm cảnh tái sử dụng ngoài camera; phạm vi sphere tính thêm biên độ chuyển động. Vật gần che chiều sâu bình thường khi nghỉ; hai lớp alpha chỉ cùng tồn tại trong blend.
- Texture atlas cached được dispose khi world environment unmount và reupload khi mount lại. Các mesh/material/texture cục bộ có cleanup theo vòng đời hiện có.
- Scene-only ẩn cả cụm chọn vùng cùng các điều khiển khác. Mức compact giảm số lá, bóng/đèn theo hệ chất lượng hiện có và vệt leader từ 32 xuống 12 hạt.

## Vệt top 1

`LeaderTrail` phát hạt tại pose của Hub đang hạng 1, đưa hạt đi cùng quãng đường môi trường rồi tan trong 1,65 giây. Đổi leader không chuyển/recolor hạt cũ sang xe mới. Vệt đổi sắc theo vùng; lúc có chuyển hạng mức nhấn tăng nhẹ. Nitro chỉ hiện khi surge; W1 giữ hệ khói skid riêng và không phát vệt leader.

Pool có số hạt cố định, không tạo mesh/texture mỗi frame. Reduced motion ẩn và xóa vệt. Các tấm khói vẫn quay theo camera khi pause nhưng vị trí/tuổi không tiến.

## Kiểm chứng local

Fixture ignored `extracted/bxh-world-qa/` dùng chính `RoadScene3D`, CSS scene của app và React StrictMode với dữ liệu Hub mẫu. Chạy `npm.cmd run dev -- --host 127.0.0.1 --port 5175 --strictPort`, mở `http://127.0.0.1:5175/extracted/bxh-world-qa/` bằng một tab Codex IAB riêng. Fixture không truy vấn DB, không tạo session đăng nhập và không gọi nhạc/radio.

Các ảnh/log/counters được lưu tại `output/playwright/bxh-world/` (ignored). Kiểm tra source: toàn bộ test suite, build, oxlint scoped, diff check; `node tools/verify-ghn-truck.mjs` xác nhận 5.018 tam giác, winding/UV/normal/texture và bốn pivot bánh xe được bảo toàn.

Browser kiểm tra bốn vùng ngày/đêm, 10/20/50 xe, chọn/bám xe, đổi KPI và Best/Worst, pause/reduced motion, chọn vùng nhanh và vòng đời vùng. Shader link được đọc từ context WebGL trong fixture, lỗi JavaScript/shader được ghi riêng. Số counter được lấy sau frame đã render; snapshot ngay giữa cleanup/mount không được dùng làm số tài nguyên nghỉ.

Kết quả ngày 13/10/2026: 637/637 test pass, build và oxlint scoped pass. Hành trình desktop đã tự đổi từ Miền Tây sang Rừng mưa; ghim Cảng biển được giữ sau unmount/mount. Hai vòng chọn đủ bốn vùng khi pause cho cùng counter nghỉ theo từng vùng: Miền Tây 31 geometry/25 program, Rừng mưa 32/28, Alps 32/27, Cảng biển 29/25; mỗi vùng 11 texture, shader link thành công và không ghi lỗi. Đây là kiểm tra vòng đời ngắn, không phải đo memory trong phiên dài. Responsive được xem ở viewport IAB 390×844.

Giới hạn bằng chứng: đây là local fixture, không phải dữ liệu production đã đăng nhập, kết quả user playtest hoặc FPS trên điện thoại thật. Cần xem ảnh runtime và trải nghiệm trực tiếp để duyệt mỹ thuật. Build vẫn có cảnh báo chunk 3D lớn; kết quả build không thay cho kiểm tra tải asset/memory trên thiết bị thật.

Kiểm tra trước merge sau khi rebase lên `459c705` (HUD mới): 645/645 test pass, build, oxlint scoped và verifier GLB pass. Điều khiển vùng tham gia cùng transition ẩn/hiện HUD mới và tôn trọng reduced motion.

Sửa vị trí picker sau phản hồi người dùng: canvas của trang đầy đủ nằm sau app header, nên vị trí `top: 12px` bị header che. Picker trong `.prr-scene-surface` nay cộng chiều cao header đã đo; desktop đặt trên cụm ngày/đêm, màn hình hẹp đặt bên trái cùng hàng ngày/đêm, dưới ngày dữ liệu. Fixture bổ sung `full.html` dùng chính `PerformanceRoadRanking`, portal điều khiển và header mẫu 80px, không có RadioProvider/DB/session đăng nhập. IAB tái hiện được header chặn hit-test trước sửa; sau sửa picker nhận hit-test, đổi vùng được trên desktop và viewport 390×844, không chồng ngày/lighting, và ẩn HUD/Esc khôi phục đúng. Build và diff check pass; đây vẫn là bằng chứng local với header mẫu, chưa xác minh production.

## Kiểm tra thêm hai thành phố — 15/10/2026

- Full suite: 669/669 test pass; bộ test world 7/7 pass sau khi chỉnh tỷ lệ công trình. Có kiểm tra thứ tự vùng, màu, biên vai đường, số instance compact và ba biểu tượng riêng mỗi thành phố.
- Codex IAB dùng `tools/city-preview.local/` (ignored), render chính `RoadScene3D` với 10 Hub mẫu. Đã xem cả hai cảnh ở desktop 1440×900 và viewport 390×844, ngày/đêm, chọn vùng khi pause/reduced motion, chọn nhanh nhiều vùng, chọn Hub/bám xe, Best/Worst và ẩn/hiện HUD. Ghim TP.HCM được khôi phục dù vùng tiếp theo trong session là Hà Nội. Ô chọn mobile rộng 112px để tên Hồ Chí Minh không bị cắt.
- Ảnh desktop/mobile lưu trong fixture. Đây là kiểm tra local với dữ liệu mẫu; chưa xác minh production đã đăng nhập hoặc FPS trên điện thoại thật. Công trình được nén tỷ lệ cho camera di chuyển; mỗi khung hình chỉ thấy một đoạn cảnh quan.

### Sau khi chọn HN2 + HCM4

- Full suite 670/670 pass; test về mật độ cửa hàng hai bên, khoảng hở tối đa 6 đơn vị, đồ vỉa hè không lấn làn, tường quầy gần thấp và compact giữ đủ cửa hàng. Build, oxlint phần source đổi và diff check pass.
- IAB xác nhận desktop 1440×900 và viewport 390×844, cả hai scene ngày/đêm, đổi khi pause/reduced motion, click trực tiếp xe chọn đúng Hub, Best/Worst và ẩn/hiện HUD. Không ghi lỗi JavaScript/shader trong tab kiểm tra.
- Ảnh runtime: `tools/city-preview.local/{hanoi-hn2,hcm-hcm4}-v2-{desktop,mobile}.jpg`; log `qa-selected-v2.json` và `final-tests.log`. Fixture là dữ liệu 10 Hub mẫu, không có đăng nhập/DB/radio. Không coi đây là bằng chứng hiệu năng điện thoại thật hay production.
