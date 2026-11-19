# KAS-314: kiểm chứng số liệu 1st Deli / ODR theo lane

Chạy ngày 2026-11-19 trên Superset (StarRocks, `sr_ghn_reporting.ka.Dtm_KA_Shopee`), kỳ deadline giao 01–31/10/2026.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Cột `ExternalLane_New` | Có tồn tại |
| Giá trị lane | `Intra region`, `Cross region`, `Intra city`, `Cross metro`, `Cross metro *` (chữ thường, có dấu cách trước dấu sao). Không có nhãn "Cross Metro*" dạng hoa; UI chuẩn hoá bằng `normalizeLane` nên vẫn gộp đúng |
| `so_dong` so với `mau_deli` | Bằng nhau (SPE 8.350.515, SPB 2.129.582 ở cận 7 ngày): không có đơn lặp theo `LoadDate` |
| Lane rỗng | 0 đơn |
| Khớp `deli_weekly_60d_test.sql` (cộng tháng 10 theo client) | Khớp tuyệt đối sau khi nới cận LoadDate, xem dưới |

Tổng tháng 10/2026 sau khi sửa (khớp query tuần):

| Client | mau_deli | ontime_deli_1st | ontime_deli_odr |
|---|---|---|---|
| SPE | 8.351.344 | 8.036.182 | 7.448.400 |
| SPB | 2.129.906 | 2.026.377 | 1.884.674 |

Query lane ra 241 dòng (SPE, 4 loại hub) và 353 dòng (SPB, 3 loại hub).

## Lỗi đã sửa

- **Cận LoadDate**: ban đầu đầu kỳ − 7 ngày (24/9) thiếu 829 đơn SPE và 324 đơn SPB (~0,01%) so với query tuần, vì có đơn nạp trong 14–23/9 nhưng hạn giao thuộc tháng 10. Đã nới thành đầu kỳ − 17 ngày (14/9), bằng cận của query tuần chạy ngày 19/11 (tuần bắt đầu 21/9, trừ 7 ngày). Con số 17 là suy ra từ lần chạy này, chưa kiểm chứng cho kỳ khác: khi chạy kỳ mới phải đối chiếu lại với query tuần.
- **Bộ lọc Loại Hub của tab Lane**: dùng `selectedHubTypes` mặc định là hợp các loại hub có trong Pick/Deli/Ca1/FD/Reverse. Nếu các nguồn đó rỗng hoặc chưa tải, danh sách rỗng làm tab Lane báo "Chưa có dữ liệu" dù bảng lane có số; nếu thiếu một loại (ví dụ `BC KD`), dòng lane tương ứng bị loại ngầm kể cả khi chọn tất cả. Nay chỉ lọc khi người dùng thu hẹp lựa chọn (`scopeLaneRowsByHubType`, có test).

## Thời gian chạy

- Query tổng theo client, cận 7 ngày: ~22–28 giây.
- Cùng loại query, cận 14/9: 2 phút 37 giây (một lần chạy, chưa lặp lại nên chưa tách được ảnh hưởng của cache).
- Query lane đầy đủ (bọc cộng theo client), cận 17 ngày: 1 phút 38 giây.

## Script sync (đề xuất, chưa chạy)

`scripts/apps-script/lane-deli-sync.gs`: đọc tab `lane_deli_tmp`, kiểm cửa sổ ngày, lane/client hợp lệ, khoá không trùng, rồi gửi từng tuần vào `upsert_kas_deli_lane_daily`. Có `dryRunLaneDeli()` chỉ log tổng theo client/tuần để đối chiếu. Không dùng lại `opsHistoryUpsert_` vì RPC lane trả `{received, changed}`.

Chưa chạy migration `20261118090000_kas_deli_lane_daily.sql` và chưa ghi gì lên Supabase.
