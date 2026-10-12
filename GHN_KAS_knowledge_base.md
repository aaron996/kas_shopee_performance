# GHN KAS — Knowledge Base nghiệp vụ (dành cho AI agent hỗ trợ task trên TMS)

> Cập nhật đến 12/10/2026. Tài liệu này là kiến thức NGHIỆP VỤ về GHN / team KAS / các client Shopee - TikTokShop, KPI, rule, workstream và quy ước làm việc. Không phải tài liệu viết query. Phần cuối (Phụ lục B) chỉ giữ một số rule dữ liệu ad hoc dễ gây sai số.
> Cách dùng: nạp file này làm context nền. Khi gặp mục có ghi "CHƯA XÁC NHẬN" hoặc "ĐANG XEM XÉT" thì không khẳng định như sự thật, hỏi lại người giao task.

---

## 0. Nguyên tắc cho agent

1. Người dùng chính: Vinh (Lương Thế Vinh), BI/Data Analyst team KAS. Giao tiếp tiếng Việt, xen thuật ngữ kỹ thuật tiếng Anh. Thích câu trả lời ngắn, trực tiếp, không văn "AI", không dài dòng.
2. Không bịa số. Thiếu dữ liệu thì nói thẳng "không đủ dữ liệu để tính X", không nội suy, không lấy tuần khác điền vào.
3. Khi yêu cầu mơ hồ: hỏi lại 1 câu cụ thể. Nếu chắc >= 80% ý người dùng thì làm và ghi rõ assumption.
4. Tỷ lệ luôn tính theo trung bình có trọng số: tổng tử / tổng mẫu, không lấy trung bình cộng các tỷ lệ.
5. Báo cáo dạng "sàng lọc" (vd COD) là danh sách nghi ngờ, không phải kết luận. Không khẳng định hành vi gian lận khi chưa có xác minh độc lập.
6. Văn phong báo cáo và comment TMS: ngắn, ít jargon kỹ thuật, bám yêu cầu gốc của task. Chi tiết kỹ thuật (SQL, debug) tách riêng, không đưa vào nội dung gửi stakeholder.
7. Số thập phân dùng dấu phẩy kiểu Việt (94,5%). Không dùng "đpt" (điểm phần trăm): khi so hai số %, nêu rõ cả hai số rồi mô tả tăng/giảm. Không emoji trong báo cáo.
8. Không đưa tên/SĐT/địa chỉ buyer vào báo cáo.

---

## 1. GHN và team KAS

- GHN (Giao Hàng Nhanh): công ty logistics Việt Nam, giao hàng chặng cuối và middle mile cho các sàn TMĐT lớn.
- KAS: Key Account Services/Solutions/Strategy, team quản lý các khách hàng lớn (key account) của GHN, chủ yếu Shopee và TikTokShop. Cách gọi tên đầy đủ thay đổi theo ngữ cảnh, dùng "KAS" là an toàn.
- Vinh: BI/Data Analyst trong KAS, phụ trách số liệu vận hành cho các account Shopee Express (SPE) và Shopee Bulky (SPB); làm báo cáo định kỳ, deep dive, tự động hóa báo cáo, và các bài phân tích điều tra (COD, quy trách nhiệm kho, penalty).

### Người liên quan (vai trò đã biết)

| Người | Vai trò |
|---|---|
| Chị Tuyền (Tuyền Võ Thị Ngọc) | Team lead KA Shopee |
| Anh Thanh | Lead data/analytics, quản lý của Vinh |
| Chị Quyên | Stakeholder cấp cao |
| Anh Long | Giám đốc vùng (GĐV) HCM, người nhận nhiều báo cáo điều hành ontime |
| Anh Đăng | Team lead CRC (chăm sóc khách hàng, xử lý phiếu/ticket) |
| Anh Danh (Nguyễn Công Danh) | Lead cụm kho GXT (giao hàng nặng) |
| Chị Phượng | KA lead TikTokShop Express (TTS), hay hỏi doanh thu/volume |
| Chị Hồng Anh | KA TTS (có mặt trong họp CRC 01/10/2026) |
| Minh Ngọc, chị Hiền | Thành viên team BI (nguồn dữ liệu, datajob) |

Ngoài ra Vinh làm part-time sản phẩm dữ liệu cho Interdist (nhà phân phối P&G), không liên quan tới task GHN trên TMS.

---

## 2. Khách hàng (client) và target KPI

### 2.1. Danh sách client

| Mã | Tên | Client ID | Ghi chú |
|---|---|---|---|
| SPE | Shopee Express | 18692 | Hàng nhẹ, phần lớn dưới 15kg |
| SPB | Shopee Bulky | 3892833 | Hàng nặng/cồng kềnh, phân bổ cả 2 nhóm cân nặng |
| Shopee Reverse | Shopee Reverse (hàng hoàn/trả) | 224845 | Chưa có target KPI riêng |
| SPX Express | SPX Express | 2781603 | Dùng target giống SPE/SPB |
| TTSE | TikTokShop Express | 3819710 | |
| TTSB | TikTokShop Bulky | 4447237 | |

Lưu ý: trong dữ liệu, SPB có thể xuất hiện dạng clientid ghép (bắt đầu bằng 3892833) ở một số bảng, SPE là số thuần 18692.

### 2.2. Target KPI

| KPI | SPE / SPB / SPX Express | TTSE | TTSB |
|---|---|---|---|
| Ontime 1st Pick | >= 97% | >= 77% | >= 75% |
| Ontime Pick Success | >= 90% | không có | không có |
| Ontime 1st Deliver | >= 95% | >= 96% | >= 94% |
| Ontime Deliver Success | >= 90% | không có | không có |
| Fail Delivery (FD) | < 3% | <= 4,5% | <= 7,3% |
| Longtail D6+ | < 2% (chỉ SPB) | Longtail Rate <= 4,85% | không có |

- Shopee Reverse: không có target. Chỉ hiển thị số thô, không tô màu đạt/không đạt. Nếu bị hỏi "đạt target chưa": trả lời "Shopee Reverse chưa có target KPI được định nghĩa".
- Màu badge KPI trong báo cáo: xanh (đạt), vàng (thiếu 0-1% so với target), đỏ (không đạt). Chỉ tô nền, không ghi chữ "Đạt/Không đạt".
- Tên gọi viết tắt trong các báo cáo điều hành: 1st Pickup, OPR, 1st Deli, ODR (không có hậu tố ".S"). Mốc thường dùng: OPR/1st Pick 97%, 1st Deli 95%, ODR 90%, FD dưới 3%. Việc OPR tương ứng chính xác với "Pick Success" trong sheet demand hay không: CHƯA XÁC NHẬN, hỏi Vinh khi cần số đối chiếu.

---

## 3. Hành trình đơn hàng và thuật ngữ vận hành

### 3.1. Các chặng

1. Pre-pickup: seller tạo đơn, hẹn ngày lấy.
2. First mile (pickup): shipper/bưu cục lấy hàng từ seller, đưa về bưu cục/kho lấy.
3. Middle mile: vận chuyển qua các kho trung chuyển (sorting/KTC) đến kho giao. Chặng thường là nút thắt của đơn trễ intra-city.
4. Last mile (delivery): kho giao (hub/bưu cục giao) phát hàng đến buyer. Nếu giao thất bại thì có các lần giao lại (attempt 2, 3) rồi chuyển hoàn.
5. Return (hoàn): đơn không giao được thì chuyển hoàn về seller.

Có một bản HTML "Shopee order journey" mô tả 10 checkpoint qua 4 nhóm Pre-pickup / First Mile / Middle Mile / Last Mile, đã làm cho team KAM.

### 3.2. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| BC / bưu cục / hub | Điểm vận hành lấy/giao hàng của GHN. Tên có tiền tố mã vùng (HNO), (HCM) |
| KTC / kho trung chuyển / sorting center | Kho trung chuyển, không phải điểm cuối. Đơn có thể qua 0 đến >= 4 lần KTC |
| Kho lấy (PickWH) / kho giao (DeliveryWH) | Kho phụ trách lấy / giao của đơn |
| GXT | Kho "Giao Hàng Nặng", cụm kho giao hàng nặng. Có region hiển thị riêng "HCM - GXT" trong báo cáo ma trận |
| GHV | Kho "Hàng Vừa" |
| KHL | Cụm kho đi cùng GXT trong bài KAS-221 (GXT/KHL HCM) |
| KA warehouse | Kho Key Account HN: "(HNO) LH Long Biên" (tên cũ Key Account Warehouse Ha Noi) |
| Ahamove | Đối tác (3PL) có kho lấy/giao riêng, tách khỏi mạng bưu cục GHN |
| CK | Bưu cục có chữ "CK" trong tên (không phải "Cồng Kềnh"; Vinh đính chính 08/10/2026) |
| Ca giao / ca 1 / ca 2 | Các ca phát hàng trong ngày. "Ca 1" là ca giao đầu tiên trong ngày hẹn giao |
| Ngày hẹn lấy / ngày hẹn giao | Mốc SLA để đánh giá ontime. Dùng cụm này, KHÔNG dùng "ngày mục tiêu" |
| GTC | Giao thành công |
| HTC | Hoàn thành công |
| FD (Fail Delivery) | Tỷ lệ đơn giao thất bại, đã trigger trạng thái chuyển hoàn |
| Longtail D6+ | Đơn giao thành công sau ngày thứ 6 trở đi (chỉ áp dụng SPB) |
| BWT Green/Red | Nhóm chỉ số "bwt" (phân loại đơn theo thời gian giao). Số liệu có trong sheet demand; định nghĩa chi tiết CHƯA XÁC NHẬN |
| Off tuyến | Điểm/tuyến (tỉnh-xã/phường) tạm ngưng nhận lấy hoặc giao (Off Pickup/Off Deli) |
| 3PL | Đơn vị vận chuyển thứ ba (cột "3PL name" trong sheet off tuyến) |
| ADO/APO | Volume ước tính theo ngày của điểm off (giao/lấy) |
| CRC | Bộ phận chăm sóc khách hàng, xử lý ticket/phiếu |
| OE | Vận hành (operation excellence), thường là bên đưa ra lập luận trễ do seller/hub trong các cuộc họp |
| Gối đầu COD | Rider giữ tạm tiền COD vài ngày rồi vẫn nộp |
| Rút ruột / chiếm dụng COD | Rider cập nhật giao thất bại/hoàn để giữ tiền COD vĩnh viễn |

### 3.3. Phân loại kho lấy (pickwh_type)

Chốt theo Vinh ngày 08/10/2026 (ưu tiên hơn data dictionary cũ): AHAMOVE (tên chứa Ahamove), GXT (Giao Hàng Nặng), KA (Key Account HN), GHV (Hàng Vừa), CK (bưu cục có chữ CK), còn lại BC.

---

## 4. Định nghĩa KPI vận hành

### 4.1. Pickup

- Ngày đánh giá pickup (order_date / pickup_order_date): nếu đơn tạo cùng ngày và giờ tạo >= 19:00 thì ngày hẹn lấy dời sang ngày kế tiếp, ngược lại giữ ngày order. Đây là "quy tắc ca 19h".
- Đơn bị loại khỏi mẫu số pickup nếu bị hủy trước hoặc đúng ngày hẹn lấy.
- 1st Pickup: đơn có lần lấy hàng hợp lệ đầu tiên đúng hạn so với ngày hẹn lấy. Nguồn dùng "first valid pickup time" (lần pick/attempt hợp lệ đầu tiên, đã loại các lý do thất bại do phía shipper như "Nhân viên gặp sự cố").
- OPR (Overall Pickup Rate): khác 1st Pickup ở mốc thời gian tham chiếu, không phải ở thành công hay thất bại. Dùng cùng mẫu số pickup.
- Rule loại đơn kho Shopee (áp mặc định cho mọi báo cáo pickup, Vinh dặn): xét theo ngày hẹn lấy, trước 01/08/2026 loại Channel "WH - Shopee"; từ 01/08/2026 loại đơn có shopee_business_type = 3.
- Mẫu số pickup không yêu cầu đã có thời điểm lấy hàng: đơn quá hạn mà chưa lấy vẫn tính trễ.

### 4.2. Delivery

- Ngày đánh giá delivery lấy theo deadline giao SLA mới (deadline_delivery_sla_new), không dùng cột deadline cũ.
- 1st Deli: giao (hoặc attempt hợp lệ) lần đầu đúng hạn so với deadline SLA giao.
- ODR (Overall Delivery Rate = Ontime Deliver Success): giao thành công đúng hạn so với deadline SLA giao.
- Thứ tự ưu tiên chỉ số delivery trong báo cáo KA: Ontime 1st Deli (quan trọng nhất, đang cam kết và bị penalty Shopee) > Ontime Succ Deli > Đến hub đúng hạn (ontime arrival). Không để OTA/ontime arrival lên trước.
- Deadline giao SLA không bao giờ rơi vào Chủ Nhật (đã kiểm chứng nhiều tuần): deadline nhảy thẳng từ thứ Bảy sang thứ Hai. Hệ quả: bucket backlog "trễ 1 ngày" của thứ Hai luôn bằng 0, là đúng nghiệp vụ, không phải lỗi.
- SLA giao tính theo ngày làm việc, loại trừ Chủ Nhật và ngày lễ (nguồn lịch: dim_calendar với các loại Working Day / Sunday / Lunar Festival / Solar Festival). SLA phụ thuộc cặp tỉnh lấy - phường giao (route/to_zone, cấp ward).

### 4.3. Fail Delivery (FD) và Longtail

- FD = đơn giao thất bại đã hoàn tất quy trình chuyển hoàn / tổng mẫu FD. Mẫu số FD là mẫu riêng (mau_fd), không dùng tổng đơn tạo thay thế.
- Longtail D6+ (SPB): tỷ lệ đơn giao thành công từ ngày 6 trở đi, target dưới 2%.
- Doc logic chỉ số: FD = tỷ lệ đơn hoàn (đã trigger trạng thái chuyển hoàn).

### 4.4. KTC / "% đơn đến hub giao còn 2 ca giao" (SPB)

- Tên cũ nội bộ: "Ontime KTC / ontime arrival". Tên hiển thị hiện hành: "% đơn đến hub giao còn 2 ca giao".
- Nghĩa: đơn về đến BC giao khi vẫn còn tối thiểu 2 ca giao. Với đơn Intra City, đơn ontime là đơn về không trễ hơn ca 1 của ngày hẹn giao.
- Phần ngược lại gọi là "đơn đến hub còn dưới 2 ca giao". Không dùng "Late KTC / Trễ KTC".
- Cơ cấu số lần qua KTC: bucket 0, 1, 2, 3, >= 4 KTC. Nhóm 3 KTC và >= 4 KTC có xu hướng tăng (W21-W26 2026): 3 KTC từ 12,1% lên 16,6%.

### 4.5. Các chỉ số điều hành khác

- %GTC theo ca, %ca1 (tỷ lệ đơn về hub giao kịp ca 1 theo lane): dùng trong báo cáo ma trận gửi group Telegram điều hành bưu cục.
- Topline: curve_ratio so cùng tháng năm trước; Runrate đơn tạo = volume tạo MTD / forecast MTD.
- Volume giải thích revenue phải đếm theo ngày giao thành công/hoàn, không theo ngày tạo đơn.

---

## 5. Lane, vùng và sáp nhập tỉnh 2026

### 5.1. Lane (externallane)

| Lane | Quy tắc |
|---|---|
| Intra City | Cùng 1 tỉnh (không riêng Hà Nội/HCM) |
| Cross Metro | CHỈ Hà Nội <-> Hồ Chí Minh |
| Cross Metro* (có dấu sao, quy ước riêng của BI) | Đà Nẵng <-> Hà Nội, Đà Nẵng <-> Hồ Chí Minh. Trong báo cáo demand có thể gộp vào Cross Metro bằng cách bỏ dấu sao; trong deep dive KTC thì để riêng |
| Cross Region | Các cặp khác vùng còn lại, kể cả các tỉnh miền Trung khác (không phải Đà Nẵng) đi Hà Nội/HCM |
| Intra Region | Cùng vùng nhưng khác tỉnh, hoặc Hà Nội <-> các tỉnh miền Bắc, HCM <-> các tỉnh miền Nam |

Vùng tính lane: North (23 tỉnh, gồm cả Thanh Hóa), Central (18 tỉnh, gồm cả Huế), South (18 tỉnh); Hà Nội và Hồ Chí Minh đứng riêng. Intra City + Intra Region thường chiếm khoảng 60% volume; Cross Metro dưới 10%.

### 5.2. Vùng vận hành (region)

- Báo cáo dùng mã vùng vận hành: HCM, HNO, và các vùng như XBG (Đông Bắc Bộ: Hải Phòng, Bắc Ninh, Quảng Ninh...), BTB (Bắc Trung Bộ: Nghệ An, Thanh Hóa...), NTB, TNB (Đồng bằng sông Cửu Long), TTB và các mã khác. Bảng mapping vùng trong sheet demand không hoàn toàn nhất quán, CHƯA XÁC NHẬN đầy đủ; khi cần chính xác hãy dùng bảng 34 tỉnh -> region đã nhúng trong query của Vinh.
- "Region mới" khi thêm cột vùng vào output = mã vùng vận hành mới tra theo TÊN TỈNH MỚI, khác region cũ trong dim phường/xã và khác North/Central/South của bảng lane.
- Trong báo cáo ma trận ontime, region HCM được tách thành "HCM" và "HCM - GXT" (kho Giao Hàng Nặng thuộc HCM). Hub Ahamove và Key Account hiển thị tự nhiên trong region gốc (không loại, không tách nhãn).

### 5.3. Sáp nhập hành chính 2026

- Địa danh đã đổi sau sáp nhập (tỉnh 63 -> 34, bỏ cấp quận/huyện). Các nguồn dữ liệu GHN xử lý không đồng bộ: có nguồn đã dùng tên tỉnh MỚI (vd "Huế"), có nguồn vẫn dùng tên CŨ (vd "Thừa Thiên Huế"). Join hai nguồn qua tên tỉnh dễ mất dữ liệu âm thầm nếu không chuẩn hóa tên.
- Đã có bảng mapping tên tỉnh cũ -> mới (khoảng 30 tỉnh đổi tên) và bảng cặp tỉnh -> lane, dựng sẵn trên StarRocks. Khớp 99,988% với lane BI tự tính.
- Sheet "Off tuyến Shopee" từ tháng 5/2026 theo địa danh mới: chỉ còn 2 cấp State + City (City thực chất là xã/phường), cột District bỏ trống. Group theo (State, City) trực tiếp. Cùng một tỉnh có thể xuất hiện dưới 2 tên ("Hà Nội" và "Thành phố Hà Nội"), cần chuẩn hóa về một tên khi tổng hợp.
- Một số phường/xã chưa được core hệ thống migrate sang ID mới, đặc biệt các đặc khu (Côn Đảo, Kiên Hải, Phú Quý) và một số phường gộp (vd Sa Pa), gây thiếu thông tin SLA cho một nhóm đơn nhỏ. Đây là nợ dữ liệu của core, không phải lỗi báo cáo.
- Khoảng 0,01% đơn có tỉnh rỗng trong bảng của BI dù nguồn gốc vẫn có tỉnh. Đây là lỗi phía BI, cần báo BI, không sửa được từ phía KAS.

---

## 6. Penalty và đền bù (Shopee)

### 6.1. Penalty KPI (nhận từ hợp đồng, Vinh xác nhận KAS-100 ngày 22/07/2026)

| Client | AOV | Buffer giao trễ 1 ngày | Target pickup | Hệ số phạt pickup |
|---|---:|---:|---:|---:|
| SPE (18692) | 20.000đ | 4% | 97% | 50% AOV |
| SPB (3892833) | 108.000đ | 6% | 97% | 50% AOV |

Tài liệu cũ ghi hệ số phạt pickup 20% AOV là LỖI THỜI, luôn dùng 50% trừ khi có rule mới hơn.

Pickup:
- Số đơn bị tính phạt = max(làm tròn(97% x tổng đơn pickup) - số đơn ontime, 0). Chỉ phạt phần thiếu so với KPI, không phạt toàn bộ đơn trễ.
- Ontime = ontime_success + ontime_attempt.
- Đơn chưa đến hạn (pending not due) không tính là trễ; số liệu của kỳ còn đơn pending là tạm tính.
- Phạt = số đơn bị tính phạt x AOV x 50%.

Delivery (tính theo từng khoảng thời gian và client):
- late_1 (trễ 1 ngày): có buffer riêng theo client (4% SPE, 6% SPB), hệ số phạt 10% AOV.
- late_2, late_3: không buffer, 30% AOV. late_4plus: không buffer, 50% AOV.
- buffer chỉ áp dụng cho late_1, không áp cho late_2 trở lên.
- Số đơn buffer = làm tròn(tổng đơn giao đủ điều kiện x tỷ lệ buffer). Đơn tính phạt late_1 = max(late_1 - buffer, 0).
- Báo cáo đối soát luôn phải có đủ cột: tổng, buffer, billable, penalty, để kiểm chứng được. Khi hiển thị late_2 trở lên, buffer_rate ghi 0.

### 6.2. KAS-100: ước tính miễn cước pickup toàn quốc SPE + SPB (đã dùng rule 50% ở trên).

### 6.3. Claim quá hạn giao / quá hạn trả (QHG / QHT)

- Bài toán "quy trách nhiệm kho": với mỗi đơn claim, xác định MỘT kho/đoạn hành trình chịu trách nhiệm, dựa trên log nhập/xuất kho và nhiều rule cạnh tranh theo thứ tự ưu tiên cố định (rule đầu tiên đúng thì thắng).
- Đã làm cho claim SPE + SPB tháng 6/2026 với 4 rule (QHG_R1, QHG_R2, QHT_R1, QHT_R2), coverage khoảng 31,3%.
- Nguyên tắc: ngưỡng và thứ tự ưu tiên rule là quyết định nghiệp vụ, phải xác nhận với người giao việc, không tự suy đoán. Không tự thêm fallback để tăng coverage; phần không quy được kho cần rule nghiệp vụ mới.
- Loại trừ kho thanh lý/xử lý ngoại lệ và kho trung chuyển khỏi vai trò điểm chịu trách nhiệm.
- Phát hiện từng gặp: thao tác thủ công sau khi đơn đã ở trạng thái cuối (vd mất hàng) làm đổi kho trên hệ thống, dẫn tới số ngày tồn kho âm. Phải chặn không đọc log sau mốc dừng đánh giá.
- Log nhập/xuất kho (inside_package_history) KHÔNG ghi việc rời kho để giao chặng cuối. Hành động unpack chỉ là "đã mở gói tại kho đích", không có nghĩa là còn tồn kho. Muốn biết đơn còn tồn tại kho ở một thời điểm phải đối chiếu thêm với thời điểm giao xong.

---

## 7. Các workstream của KAS (để hiểu bối cảnh task trên TMS)

### 7.1. Báo cáo KA định kỳ (DOCX/HTML) cho SPE, SPB, TTSE, TTSB

- Nội dung: Topline volume, OPS KPI (pickup, delivery, FD), Compensation, deep dive Region/Hub (mục 3.1-3.3), highlight và lowlight.
- Báo cáo tháng cho BOD: kết quả kinh doanh Shopee/TikTokShop, bảng số liệu màu xanh/vàng/đỏ theo đạt/không đạt chỉ tiêu.
- Quy ước trình bày:
  - Chiều thời gian luôn là cột (tuần/tháng = cột, chỉ số = hàng). Không transpose.
  - Header cột tuần/tháng hiển thị ngày dạng YYYY-MM-DD trong báo cáo GXT, không dùng "Wk-XX".
  - Deep dive Middle Mile: 2 chỉ số chính là Ontime 1st Deli và Leadtime MM trung bình. Không làm bảng riêng cho Ontime Succ Deli, Ontime Arrival, LT p95 (chỉ đưa vào bảng tổng hợp nếu cần).
  - Biểu đồ HTML: tooltip hiển thị cả giá trị tuyệt đối và % đóng góp (hoặc % hiệu suất tùy chỉ số).
- Quy tắc độ trễ dữ liệu FD / Longtail (OPS Weekly):
  - Chỉ cột cuối cùng (tuần hiện tại, W(n)) lag n-2: hiển thị số liệu gốc của tuần W(n-2). Các cột trước hiển thị số liệu gốc của chính tuần đó, không lag.
  - Gap WoW của cột cuối tính trên cặp đã lag. Mọi cột kể cả cột cuối đều tính pass/fail bình thường (không dùng "Chưa đủ DL" ở bảng weekly).
  - Bảng monthly (MTD đang chạy) giữ trạng thái "Chưa đủ DL" cho FD/Longtail.
  - Rule lag n-2 này tách biệt với FD lag n-1 của module deep dive hub (mục 3.1-3.3), không áp dụng chéo.
- Khi gửi file zip cập nhật skill: chỉ gửi SKILL.md + references, không kèm báo cáo DOCX.
- Báo cáo GXT HCM (Shopee Bulky): gồm Pickup Performance, Attempt Delivery (tỷ lệ gán delivery, ontime 1st delivery, leadtime), Success Delivery (GTC, ontime, leadtime), deep dive deli, phân tích đơn về kho đã trễ, Highlight/Lowlight.

### 7.2. Phân tích demand hàng tuần (SPE, SPB, Reverse, SPX Express)

- Nguồn: Google Sheet riêng cho từng client (đồng bộ bằng Apps Script), grain tuần x tỉnh/lane/cân nặng; sheet deep dive hub ("Auto source Shopee full chi so") grain tuần x hub, chứa cả SPE và SPB, chỉ giữ khoảng 4 tuần gần nhất.
- Luôn nói rõ data có đến tuần nào trước khi phân tích. Chỉ đưa số tổng hợp, không đưa dữ liệu thô.
- Với SPB, mẫu số FD, mẫu số pickup, mẫu số delivery là các cột riêng. Dòng kho giao có mẫu pickup = 0 và ngược lại; lọc đúng mẫu trước khi tính từng chỉ số.
- Nếu người dùng nói "Shopee" hoặc "TikTok" không rõ loại: hỏi lại client cụ thể. TTSE/TTSB hiện chưa có sheet demand.
- Cột "wh_type" trong sheet demand: BC, Ahamove (và KA trong sheet hub).

### 7.3. Báo cáo ma trận ontime gửi điều hành (Telegram)

Năm loại báo cáo, dùng chung theme/design:
1. Miền/Vùng/Hub: ma trận 4 chỉ số (1st Pickup, OPR, 1st Deli, ODR), toàn quốc, gửi anh Long.
2. Top N Seller VIP: xếp hạng seller trễ, có cột kho lấy.
3. Ca/Hub: ma trận theo ca làm việc (vd %GTC).
4. Focus 1 vùng: bản rút gọn Loại 1 cho 1 vùng (ví dụ HNO), top 10 hub theo volume D-1, kèm bảng phụ "10 BC tệ theo lượng đơn trễ".
5. Lane / Ca1: % đơn về hub giao Ca 1 theo lane, theo ngày x lane x vùng/tỉnh giao.
- Báo cáo có tóm tắt so sánh D-1 với D-8 và top 3 vùng.
- Các tab dữ liệu Pick, Deli, Ca1 đã được đưa vào cùng một Google Spreadsheet để job n8n đọc tự động.

### 7.4. n8n và Telegram bot

- Các workflow n8n gửi báo cáo hàng ngày lên Telegram: Pick / Deli / Ca1, HNO, SPB, GXT-KHL.
- Việc bảo trì thường gặp: chuyển chat_id, lỗi đồng bộ node Merge, chuyển nguồn dữ liệu sang Supabase.
- Pipeline tổng thể: lakehouse chỉ đọc -> datajob BI -> Google Sheet/Apps Script sync -> Supabase -> React -> Vercel.

### 7.5. KAS-205 / KAS-221 — Sàng lọc gối đầu / chiếm dụng COD của rider

Bối cảnh: rider đã giao và thu COD nhưng không cập nhật ngay; hoặc cập nhật giao thất bại/hoàn để giữ tiền.
- Gối đầu: giữ tạm vài ngày rồi vẫn nộp, đơn cuối vẫn "delivered". Cơ chế đã xác minh qua gọi buyer thật: rider tạo cuộc gọi ảo 0-2 giây và attempt giả những ngày trước, vài ngày sau mới bấm giao thành công, và đúng ngày bấm hoàn tất thường không có cuộc gọi nào.
- Chiếm dụng / rút ruột: cập nhật giao thất bại hoặc chuyển hoàn để giữ tiền vĩnh viễn.
- Đây là bài SÀNG LỌC, không phải CHỨNG MINH. Không kết luận hành vi khi chưa có xác minh độc lập. Kết quả là danh sách đơn/rider để kiểm tra nội bộ.
- Nhãn cột mức độ hiện hành: "Mức nghi ngờ" (thay cho "mức ưu tiên xử lý", đã thay "mức ưu tiên gọi xác minh"). Đếm và báo cáo theo mã đơn, không theo dòng (một đơn có thể có nhiều dòng).
- Tiêu chí gốc 4 điều kiện: COD lớn (ngưỡng 1 triệu đồng), giao chậm từ 72 giờ (thời điểm gán giao tới kết thúc giao), nhiều ngày giao thất bại (từ 3 ngày), và ngày cuối không có cuộc gọi.
- Từ bản v20, chuyển sang mô hình điểm đa tín hiệu (M1-M16) thay cho lọc nhị phân và ranking theo khối lượng, theo góp ý anh Thanh ("cần thu hẹp bằng công thức để tăng độ chính xác"). Các tín hiệu đã biết: M7 (lý do fail mâu thuẫn với call log), M8 (hẹn giao lại nhưng ca tiếp theo cách từ 2 ngày), GPS/POD bất thường (khoảng cách thực tế lệch địa chỉ, tọa độ trùng khớp giữa nhiều đơn của cùng rider, cờ GPS giả lập "mocked"). Cờ mocked một mình không đặc hiệu.
- Bộ 02 (score model 02d) đã giao BI làm cronjob data_job_kas_daily_cod. Feedback BI 04/10/2026: COD của đơn returned bị 0 trong cột chính nên nhánh "Rút ruột" mất khoảng 85% đơn; phải lấy COD từ cột backup (cod_amount_bk) trước. Vinh đã yêu cầu sửa.
- Bản 02d còn quá lớn (1.876 đơn/460 tài xế); đề xuất thu hẹp CHƯA áp dụng.
- Bản 02e: đơn đã delivered, ưu tiên theo từng đơn. Bản 02f: đơn đã gán giao nhưng chưa kết thúc giao (cảnh báo sớm), có gate 72 giờ; mức nghi ngờ Cao = (M7 hoặc M9) + GPS giả lập tại thời điểm fail; Trung bình = M7 hoặc M9 nhưng không đủ GPS giả lập. 2f chưa kiểm chứng precision/recall.
- Mở rộng toàn quốc, hướng tiếp theo: lớp chấm điểm nội dung SMS bằng AI; dashboard module KAS-235 cho danh sách đơn nghi ngờ.
- KAS-221: biến thể áp phương pháp cho cụm kho GXT/KHL HCM (cần xác nhận kho giao hay kho lấy, đừng tự suy đoán danh sách kho).

### 7.6. CRC — "Đơn tồn hub giao" và auto-ticket (KAS-253)

Chốt trong họp 01/10/2026 (anh Đăng, chị Tuyền, chị Hồng Anh): áp logic đang dùng cho luồng SME vào auto tạo ticket; team anh Đăng xử lý phiếu.
- Điều kiện (cả 4 đều đúng): kho hiện tại = kho giao; đã nhập hub giao quá 48 giờ; chưa GTC/HTC (loại delivered, cancel, mọi trạng thái chứa "return"); COD > 3.000.000đ.
- Phạm vi: SPE, SPB, TTSE, TTSB toàn quốc. KHÔNG gồm SPX Express và Shopee Reverse. Giữ cả đơn "delivering" nếu đã vượt 48 giờ kể từ nhập hub giao.
- Khác KAS-205: COD 3 triệu (không phải 1 triệu), lọc đơn CHƯA giao, không dùng fail attempt / call log / GPS. Đây là bài "đơn tồn", không phải sàng lọc gian lận.
- Lần chạy đầu 01-02/10/2026: khoảng 725-731 đơn, COD khoảng 4,36 tỷ. Phân bố 725 đơn: SPB 374, SPE 121, TTSB 113, TTSE 117. Hà Nội và HCM dẫn đầu.
- Phép đo tháng 9/2026: trung bình khoảng 470 đơn mới lọt gate mỗi ngày, COD mới khoảng 2,75 tỷ/ngày. Khối lượng này rất lớn với đội CRC, cần báo trước khi bật auto-ticket. Nếu cần giảm tải thì nới 48 giờ lên 72 giờ an toàn hơn nâng ngưỡng COD (COD 5 triệu bỏ sót 62% case đã xác nhận).
- Dedup bằng bảng log riêng (mỗi đơn 1 dòng, ghi lúc lọt gate lần đầu), Google Sheet 2 tab (Tab 1 = toàn bộ log, Tab 2 = đơn mới của lượt chạy).
- Thử nâng cấp bằng tín hiệu của bài 02 (03f) cho kết quả không chính xác hơn (AUC 0,52, như đoán ngẫu nhiên), khuyến nghị không dùng để cắt/ưu tiên ticket.
- Cập nhật mới nhất: 08/10/2026, Vinh set datajob chạy khoảng 9h hàng ngày xuất đơn HCM sang Google Sheet RPA để tự tạo ticket cho CRC, và đánh dấu KAS-253 Done. Gate cho batch ticket hàng ngày chọn theo ngày dương lịch: đơn nhập hub giao ngày D-3, tồn 2 đến 3 ngày, đến lúc chạy vẫn chưa xong, giữ điều kiện kho hiện tại = kho giao, nên không cần dedup bằng script. Đợt đầu chạy 07/10 và 08/10 chỉ cho HCM.
- Đã kiểm chứng trên hệ thống nội bộ: giờ nhập hub giao của một đơn mẫu khớp output. Trạng thái trong bảng order có thể trễ so với hệ thống nội bộ (vài đơn hiển thị "transporting" dù đã nhập hub giao), chỉ sai nhãn, không ảnh hưởng lọc.

### 7.7. Phân tích KTC của SPB và "seller VIP"

(a) Deep dive "% đơn đến hub giao còn 2 ca giao" của SPB cho họp vận hành (W21-W26 2026):
- Trả lời 2 câu hỏi: lane nào cần trao đổi trước với vận hành, và trong lane đó tỉnh nào tạo nhiều đơn đến hub còn dưới 2 ca giao nhất.
- Không xếp ưu tiên chỉ theo tỷ lệ thấp, cũng không chỉ theo số đơn. Lane cần đưa ra trao đổi trước là lane vừa có chất lượng nội tại thấp, vừa có tỷ trọng đơn đến hub còn dưới 2 ca giao toàn quốc đủ lớn.
- Kết quả W26: toàn quốc 88,5% (tổng 429.619 đơn, 49.384 đơn còn dưới 2 ca giao). Intra City đứng đầu cần trao đổi: 72,8%, chiếm 25,8% tổng đơn đến hub còn dưới 2 ca giao toàn quốc; trong đó Hà Nội 60,3% và chiếm 70,1% đơn dưới 2 ca giao của lane (8.927/12.735). Cross Metro* có tỷ lệ thấp nhất (46,4%) nhưng tỷ trọng toàn quốc thấp hơn Intra City (10,8%) nên xếp sau. 5 cặp lane-tỉnh cần trao đổi trước: Intra City Hà Nội, Cross Metro* Đà Nẵng, Cross Metro Hà Nội, Intra City Hồ Chí Minh, Cross Metro Hồ Chí Minh.
- Wording nên dùng: "% đơn đến hub giao còn 2 ca giao", "đơn đến hub còn dưới 2 ca giao", "toàn quốc", "cặp lane - tỉnh", "điểm trung chuyển", "tỷ trọng trong lane", "tỷ trọng toàn quốc".
- Wording KHÔNG dùng: "Ontime KTC", "Late KTC", "Trễ KTC", "toàn SPB", "Mức ưu tiên xử lý", "absolute count", "contribution", và các từ kỹ thuật (tooltip, font, responsive, SVG, Chart.js) trong nội dung hiển thị.
- Báo cáo ngắn, dùng được ngay trong họp, không phải dashboard kỹ thuật. Draft nội dung và số liệu trong chat trước, chỉ xuất HTML sau khi người dùng xác nhận.

(b) Phân tích quy trách nhiệm trễ giao SPB/SPE intra-city để phản biện lập luận "seller (đặc biệt VIP) bàn giao trễ nên đơn trễ hub":
- Hành trình 3 chặng: (1) bàn giao (endpicktime) -> nhập KTC đầu, (2) KTC đầu -> nhập kho giao (middle mile), (3) kho giao -> giao thành công. Metric của OE bắt đầu bấm giờ từ nhập KTC nên bỏ qua chặng 1.
- Kết luận điển hình đã xác nhận: phần lớn đơn trễ hub là đơn đã vào KTC đúng giờ mà vẫn không về kho giao kịp, nút thắt nằm ở chặng KTC -> kho giao, không tương quan với giờ bàn giao của seller. Cách phát biểu an toàn: "nút thắt chặng KTC -> kho giao, không tương quan giờ bàn giao seller". Không khẳng định "toàn bộ do middle mile" hay "seller không liên quan gì" vì chưa tách được chặng pickup -> KTC đầu thành "seller trễ" và "first mile GHN chậm".
- "Vào KTC trước 22h30" có 2 định nghĩa: lỏng (chỉ xét giờ, như query gốc của OE, bị thổi phồng) và chặt (trước 22h30 đúng ngày endpicktime). Ví dụ Hà Nội: lỏng 89,7%, chặt 79,0%. Luôn nói rõ đang dùng định nghĩa nào; lý tưởng trình bày cả hai.
- "Bàn giao sau 21h" là mốc giờ tuyệt đối, không phải trễ so với COT cam kết từng seller.
- "Đơn trễ cả 3 khâu" là GIAO của 3 điều kiện (bàn giao sau 21h, KTC trễ, hub trễ), không phải tổng; con số nhỏ là bình thường.
- Tệp VIP = đơn VIP có mã người gửi Shopee truyền (từ 06/05/2026); đơn VIP không có mã sẽ rớt khỏi tệp, cần ghi chú.

### 7.8. Off tuyến Shopee

- Hai Google Sheet riêng: Off Delivery và Off Pickup (cột: ngày off, ngày on, 3PL, State, City, District, ADO/APO, % capdown, lý do, note, status).
- Status: "Done" = đã off xong (đã on lại); "In process" = đang off. Khi hỏi "đang off bao nhiêu điểm", lọc status = In process.
- Metric card = số dòng In process tại thời điểm hiện tại (con số tĩnh). Chart trend theo tuần = số điểm MỚI bắt đầu off trong tuần đó (theo ngày off, status In process), KHÔNG cộng dồn. Điểm cuối chart không được trùng tổng ở card. Bảng theo tỉnh: đếm điểm theo State, tổng khớp metric card.
- Range tuần của chart bắt đầu từ tuần sớm nhất có In process (xét cả 2 tab), tuần không có điểm mới vẫn giữ giá trị 0.
- Chỉ tập trung tuyến đang off, không hiển thị Done trừ khi được yêu cầu xem lịch sử.

### 7.9. Log ODR / OPR hàng ngày

- Lý do tồn tại: nguồn BI (Dtm_KA_Shopee) chỉ giữ khoảng 120 ngày (rolling, và đã xác nhận sẽ không mở rộng), nên team tự trích xuất và lưu số liệu hàng ngày; nếu không dữ liệu ngày cũ mất vĩnh viễn.
- Bảng log tách theo ngày, loại chỉ số (ODR hoặc OPR), client (SPE/SPB), tỉnh lấy/giao (tên tỉnh mới), đội giao (GHN hoặc Ahamove).
- Hiện chạy rolling 30 ngày mỗi ngày (xóa và ghi lại), đánh đổi: số liệu các ngày cũ trong cửa sổ có thể bị ghi đè nhẹ vì dữ liệu nguồn sống.
- Đã backfill 2026-01-01 đến 2026-05-06 bằng cách tự tính lại deadline giao SLA từ nguồn đầy đủ (sai lệch tổng đơn tối đa 0,07%, tỷ lệ lệch tối đa 0,02 điểm so với baseline), trừ 4 ngày nghỉ Tết (16-19/02/2026).

### 7.10. Dashboard OE và doc KPI

- Vinh từng tham gia làm dashboard OE (clone từ dự án Titan của TTS). Các query nhóm KTC (hàng về KTC, xuất kiện trễ, số lần qua KTC, leadtime KTC) thuộc dự án này và được quyết định KHÔNG đưa vào doc KAS-262.
- KAS-262: doc logic và query mẫu các chỉ số KA Shopee. Quy tắc viết doc: dùng "ngày hẹn lấy/ngày hẹn giao"; tên OPR, ODR; chỉ chứa logic tính toán và 1 query mẫu mỗi chỉ số; không tham chiếu Metabase/sheet; không viết như hướng dẫn cho AI agent. Longtail D6+ Vinh tự bổ sung.

### 7.11. Việc đang treo / hướng sắp tới

- Backfill lịch sử SLA/ODR/OPR bằng pipeline tự dựng (BI chưa mở rộng retention).
- Xin BI cấp quyền bảng cầu nối (bridge) SLA v2 (chưa có phản hồi) và sửa các lỗi chất lượng dữ liệu (tỉnh rỗng, retention).
- Mở rộng sàng lọc COD toàn quốc và lớp chấm điểm SMS bằng AI.
- Dashboard KAS-235 cho danh sách đơn nghi ngờ.
- Bản tiếng Anh portfolio của Vinh (mục tiêu cá nhân, ưu tiên cao).

---

## 8. TMS (KATMS) — quy tắc làm việc

- Hệ thống quản lý công việc nội bộ: katms.vercel.app. Project của team: key "KAS" (project ID cd335a66-75e4-4e62-a035-152f1b7e9b41). Mã task dạng KAS-12.
- Các thao tác thường dùng: lấy task, tạo task, thêm comment, cập nhật hàng loạt, lưu trữ (archive), tạo/duyệt request, xem thông báo, xem công việc của tôi (my_work).
- Mô tả task: ngắn gọn; chi tiết triển khai để trong comment.
- Ghi chú/cập nhật tiến độ: dùng comment (add_comment), không sửa trường mô tả.
- Comment: ngắn gọn, ít kỹ thuật, tập trung vào yêu cầu gốc; không liệt kê chi tiết SQL/implementation.
- Tạo task: title dạng động từ hành động; mô tả có mục tiêu / bối cảnh / yêu cầu / output; priority mặc định MEDIUM ("gấp/khẩn" = URGENT, "quan trọng/cần sớm" = HIGH, "khi rảnh" = LOW). Nếu người dùng không nêu deadline thì hỏi trước khi tạo. Nếu không nêu assignee: nếu có vẻ là việc của chính người tạo thì gán cho người tạo và thông báo, nếu không thì hỏi.
- Code trong mô tả/comment: bọc bằng fenced code block có tên ngôn ngữ. Link dùng markdown [Tiêu đề](URL).
- Gợi ý chuyển trạng thái từ nội dung comment (xong -> Done, đang làm -> In Progress, bị chặn -> Blocked...), chỉ đổi trạng thái khi người dùng đồng ý.
- Sau khi tạo task hoặc comment, luôn trả lại link task. Tóm tắt tiến độ: trạng thái, mục tiêu, diễn biến chính theo ngày, tình trạng hiện tại, đề xuất.
- Các task đã biết: KAS-100 (ước tính miễn cước pickup), KAS-205 / KAS-221 (sàng lọc COD), KAS-235 (dashboard đơn nghi ngờ), KAS-253 (CRC giám sát / auto ticket, đã Done 08/10/2026), KAS-262 (doc logic chỉ số KA Shopee).

---

## 9. Chủ đề nghiệp vụ cần hỏi người giao việc (không tự suy đoán)

- Ngưỡng và thứ tự ưu tiên của rule quy trách nhiệm kho.
- Danh sách kho cụ thể của cụm (GXT/KHL...), và vai trò kho lấy hay kho giao.
- Client nào, phạm vi nào, kỳ nào khi yêu cầu chỉ nói "Shopee" hoặc "TikTok".
- Xuất file hay trả lời trong chat; Word hay HTML.
- Với rule mâu thuẫn giữa tài liệu cũ và mới: luôn ưu tiên xác nhận mới nhất của Vinh (vd penalty pickup 50% thay 20%; nhãn "Mức nghi ngờ").

---

## Phụ lục A — Bảng tóm tắt số liệu tham chiếu

| Chỉ số | Giá trị | Nguồn / thời điểm |
|---|---|---|
| Penalty pickup | 50% AOV, KPI 97% | KAS-100, 22/07/2026 |
| AOV | SPE 20.000đ, SPB 108.000đ | Hợp đồng |
| Buffer late_1 | SPE 4%, SPB 6% | Hợp đồng |
| Gate CRC đơn tồn | Inbound hub giao > 48h, COD > 3 triệu | Họp 01/10/2026 |
| Gate COD gối đầu (delivered) | Gap >= 72h, COD > 1 triệu, fail >= 3 ngày | KAS-205 |
| Gate 2f (pending) | first_delivered_time cách thời điểm chạy >= 72h | 05/10/2026 |
| % đơn đến hub giao còn 2 ca giao SPB W26 | 88,5% toàn quốc | Deep dive KTC |
| Volume CRC tồn mới/ngày | Khoảng 470 đơn, 2,75 tỷ COD | Tháng 9/2026 |

## Phụ lục B — Một số rule dữ liệu ad hoc (chỉ giữ cái dễ sai số)

- Nguồn chính của số liệu KA: bảng tổng hợp theo đơn "Dtm_KA_Shopee" (BI giữ khoảng 120 ngày, có bản lane/tỉnh theo tên mới) và "Dtm_KA_V3_CreatedDate" (đầy đủ lịch sử, vẫn dùng tên tỉnh cũ, không có cột lane). Khi cần cột địa lý "_new" (region/province/ward/lane mới) phải lấy từ Dtm_KA_Shopee.
- Mặc định mọi query viết theo StarRocks (trừ khi Vinh nói rõ Trino/Iceberg cũ). Nguồn có tên bắt đầu bằng "sr_" mới chạy trên StarRocks thật.
- Server StarRocks chạy giờ UTC (lệch 7 tiếng so với giờ Việt Nam): mọi mốc "hôm nay" phải đổi múi giờ, nếu không từ 00:00-06:59 giờ VN sẽ lấy nhầm sang hôm trước.
- Cột bị mask (tiền, thông tin người gửi/nhận) trả về NULL âm thầm, không báo lỗi. Số liệu toàn NULL/0 bất thường: nghi mask trước khi nghi query sai. Nếu chạm cột ngoài quyền, TOÀN BỘ query bị từ chối.
- Thông tin buyer (tên/SĐT/địa chỉ) trên StarRocks ở dạng plaintext, chỉ cần SELECT thẳng.
- Bảng ticket CX (data_tickets): dùng bản Trino gốc, không dùng bản StarRocks (phân quyền theo cột gây lỗi mơ hồ).
- Bảng SLA v2 không duy nhất theo (route, to_zone) — join thẳng gây nhân dòng hàng nghìn lần; phải khử trùng trước.
- Cột COD của đơn returned có thể bằng 0 ở cột chính; phải ưu tiên cột backup (cod_amount_bk) khi tính COD cho nhánh hoàn.
- Cột partition trên nhiều bảng (nhất là dạng chuỗi) không chấp nhận hàm ở vế so sánh; dùng literal ngày. Bảng dtm_* chạy qua BigQuery JDBC nên vẫn phải giữ filter partition như Trino.
- Phân loại sàn "WH - Shopee" cần loại khỏi pickup theo mốc 01/08/2026 (xem mục 4.1).
- Không bao giờ tin kết quả trước khi đối chiếu: Vinh tự chạy query trên Superset/SQL Lab và so với ground truth; ưu tiên validate bằng case thật.
- Tên bảng/cột và schema thay đổi theo thời gian (sáp nhập, migrate StarRocks). Khi không chắc, hỏi Vinh hoặc tra data dictionary, không đoán.
