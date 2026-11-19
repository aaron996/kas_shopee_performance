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

Migration `20261118090000_kas_deli_lane_daily.sql` đã áp lên Supabase (project KAS GHN) ngày 2026-11-19 với tên `kas_deli_lane_daily` (version do công cụ gán, khác tên file); bảng đang rỗng, chưa đẩy dữ liệu.

## Datajob trên AI Portal

Đã gửi 2026-11-19: `data_job_kas_deli_lane` (#1022), Starrocks → Google Sheets, trạng thái "In review" (chờ approver). SQL = `docs/sql/deli_lane_daily_8w.sql` (cửa sổ cuộn 8 tuần, cùng cửa sổ với query tuần và script sync). Target: OPS Sheet, `lane_deli_tmp!A:G`, `tag_alert` `@Vinlug96`. Cron để trống (chỉ chạy tay) như job #1004, vì script sync lane chưa được duyệt và chưa cài vào Apps Script.

Tab `lane_deli_tmp` đã được tạo (trống) trong OPS Sheet ngày 2026-11-19, nằm sau tab `Pick`.

### Kiểm chứng SQL cuộn (2026-11-19, Superset)

Chạy `deli_lane_daily_8w.sql` (bọc cộng theo client) và đối chiếu với `deli_weekly_60d_test.sql` (giữ nguyên CTE `Hub_Day`, cộng theo client) trong cùng cửa sổ deadline 2026-09-21 → 2026-11-18. Khớp tuyệt đối:

| Client | mau_deli | ontime_deli_1st | ontime_deli_odr | Số dòng lane / hub-day |
|---|---|---|---|---|
| SPE | 15.469.703 | 14.865.381 | 13.793.978 | 452 / 63.698 |
| SPB | 4.213.217 | 3.989.951 | 3.716.750 | 675 / 68.076 |

Lane rỗng = 0. SPE có 5 lane và 5 loại hub, SPB có 5 lane và 4 loại hub. Query lane chạy 41 giây, query tuần 1 phút 19 giây (mỗi query chạy một lần). Kết quả 452 + 675 = 1.127 dòng, nằm trong giới hạn 20.000 dòng/lô của RPC.

### Cài script và dryRun (2026-11-19)

`lane-deli-sync.gs` đã được thêm vào project Apps Script `auto` (file `lane-deli-sync.gs`, các file khác không đổi). Tab `lane_deli_tmp` được nạp thử bằng kết quả SQL cuộn (1.127 dòng, lấy từ Superset qua một ô `group_concat` rồi dán vào A1); job #1022 khi chạy sẽ ghi đè tab này.

`dryRunLaneDeli()` chạy xong, không lỗi, không gọi Supabase: 1.127 dòng, cửa sổ 2026-09-21..2026-11-18 (9 tuần), tổng theo client khớp query tuần (SPE 15.469.703 / 14.865.381 / 13.793.978; SPB 4.213.217 / 3.989.951 / 3.716.750). `syncLaneDeli()` chưa chạy, bảng `kas_deli_lane_daily` vẫn rỗng.

Lưu ý khi nạp dữ liệu từ Superset: API xuất CSV và token CSRF bị chặn với script, nút Export tải file về máy; `group_concat` trong StarRocks dùng dấu phân cách mặc định `,` (tham số thứ hai chỉ nối thêm vào chuỗi), nên mỗi dòng sau dòng đầu có thêm dấu `,` ở đầu cần bỏ.
