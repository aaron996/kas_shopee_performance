# Bảng lịch sử Pick/Deli/FD, chế độ xem theo tuần và retention

Trạng thái 12/10/2026:

| Phần | Pick | Deli | FD |
|---|---|---|---|
| Bảng lịch sử trên Supabase | đã tạo | đã tạo | đã tạo |
| Backfill 8 tuần | **đã chạy** (17/08 → 11/10, 115.395 dòng, khớp Superset) | **đã chạy** (17/08 → 10/10, 119.195 dòng, khớp Superset) | **đã chạy** (17/08 → 04/10, 124.845 dòng, mẫu khớp Superset, hoàn thành lệch 1–10 đơn ở 3 tuần vì FD đổi theo thời gian) |
| Sync hằng ngày vào bảng lịch sử | đã móc trong `syncOneTab()` | đã móc (cùng dòng delegate, chưa có lần chạy thật) | đã móc (như Deli) |

RPC đọc theo tuần, retention (pg_cron) và toggle "Theo tuần" ở frontend đã làm; toggle chưa được xem
trên trình duyệt với đăng nhập thật (chỉ có test và build). Leadtime để ngoài phạm vi. Bối cảnh và số
liệu thử: [tech-debt.md](tech-debt.md) mục 1.

## Vì sao có bảng riêng

`kas_pick_data` (và Deli, FD) giữ đúng cửa sổ 14 ngày, có cột benchmark, và nhiều nơi đang đọc cả bảng
(dashboard, snapshot n8n, RPC chat). RPC delta hiện tại còn **xoá ngày rơi khỏi cửa sổ** và guard từ chối
tab có ngày ngoài cửa sổ ([ops-incremental-sync.md](ops-incremental-sync.md)). Backfill 8 tuần vào các bảng đó
sẽ bị xoá ở lần sync sau. Vì vậy dữ liệu dài hạn nằm ở bảng riêng, không bao giờ xoá theo cửa sổ; hai bộ
bảng cùng tồn tại, gộp lại là việc giai đoạn sau (khi có đủ 46 ngày, benchmark tính được từ bảng lịch sử).

## Bảng và RPC (migration [20261012100000](../supabase/migrations/20261012100000_kas_pick_history.sql), [20261012120000](../supabase/migrations/20261012120000_kas_history_deli_fd_read_retention.sql))

- `kas_pick_history`, `kas_deli_history`, `kas_fd_history`: hub-ngày, khoá tự nhiên là các cột nhóm của query
  BI, với `NULLS NOT DISTINCT` vì `region` / `wh_id` có thể rỗng. `week_start` là cột sinh (thứ Hai của tuần,
  khớp `date_trunc('week')` của StarRocks; không dùng `date_trunc` vì không immutable với kiểu date). Không có
  cột benchmark (`best_l6w_*`, `sameday_lm_*`): hai nhóm này so theo 46 ngày và cùng ngày tháng trước, không
  tính được khi đổi range.
- `upsert_kas_{pick,deli,fd}_history(rows jsonb)`: chỉ `service_role`. Upsert theo lô tối đa 20.000 dòng,
  chỉ ghi dòng mới hoặc có giá trị đổi (chạy lại là no-op, không đổi `synced_at`), khoá trùng trong một lô là
  lỗi, không có đường xoá.
- `get_kas_weekly_rows(dataset, weeks default 9)`: cho `authenticated` (giống chính sách đọc `kas_*_data`),
  `dataset` là `pick` / `deli` / `fd`, `weeks` từ 1 đến 16. Trả một `jsonb` duy nhất (không dính giới hạn 1000
  dòng của PostgREST) gồm danh sách tuần và các dòng hub-tuần, mang đúng tên cột của dòng hàng ngày
  (`report_date` là thứ Hai của tuần, thêm `days` là số ngày có dữ liệu). Giữ mức hub (không cộng sẵn lên
  vùng) vì app còn phải chạy `normalizeDashboardRows` (KA, CK theo hub/`wh_id`, GXT theo Miền). Đo trên
  dữ liệu thật 12/10: Pick 8 tuần là 19.885 dòng, khoảng 3,7 MB JSON chưa nén.
- **Bảng cộng sẵn theo tuần** (migration [20261013120000](../supabase/migrations/20261013120000_kas_weekly_rollup.sql)):
  `kas_{pick,deli,fd}_weekly`, cùng khoá nhóm với RPC cũ cộng `days`. `get_kas_weekly_rows` đọc bảng này thay vì
  `GROUP BY` ~120 nghìn dòng hub-ngày: đo ngày 13/10 trên DB thật, Deli từ 9,6 giây xuống 0,36 giây, kết quả
  khớp từng dòng với bản cũ (3 bảng, 9 tuần). Bảng được giữ đồng bộ bằng trigger mức câu lệnh trên bảng lịch
  sử (INSERT/UPDATE/DELETE tính lại đúng các tuần bị chạm, TRUNCATE xoá bảng tuần), nên upsert, backfill và
  `prune_kas_history` không cần sửa. Nếu nghi lệch, chạy lại
  `select public.refresh_kas_<pick|deli|fd>_weekly(array(select distinct week_start from public.kas_<...>_history))`.
  Nút "Xuất CSV" chế độ Theo tuần cũng đọc qua RPC này.
- **`get_kas_weekly_compact`** (migration [20261013140000](../supabase/migrations/20261013140000_kas_weekly_compact_rpc.sql)):
  app dùng bản này, mỗi dòng là mảng theo thứ tự `cols` (Pick 4,2 MB → 1,7 MB, cùng số dòng). Lý do: ngày 13/10
  3 lệnh `get_kas_weekly_rows` gọi song song từ trình duyệt đều trả 500 `57014 statement timeout` sau ~37 giây dù
  hàm chỉ chạy 0,4–0,75 giây khi gọi trực tiếp; lúc đó trang đang bắn ~190 request và `app_user_roles` cũng bị
  ngắt kết nối, tức tầng API của DB nhỏ bị nghẽn. Xuất CSV theo tuần giờ tải lần lượt từng bảng, không song song.
  `get_kas_weekly_rows` giữ nguyên cho bản frontend cũ.
- Bảng bật RLS, không cấp quyền cho `anon`/`authenticated`; app chỉ đọc qua RPC.
- Retention: `prune_kas_history(keep_days default 90)`, chỉ `service_role`, tối thiểu 70 ngày (không cắt vào
  8 tuần nguyên + tuần hiện tại), tính theo giờ Việt Nam. Job pg_cron `prune_kas_history_daily` chạy lúc
  20:30 UTC (03:30 giờ Việt Nam). Xem lại: `select * from cron.job where jobname='prune_kas_history_daily'`.

## Apps Script ([ops-history-sync.gs](../scripts/apps-script/ops-history-sync.gs))

Thêm vào project `auto`, dùng lại `opsDeltaNormalizeRows_` và `opsDeltaRpc_` của `ops-incremental-sync.gs`. Mỗi
chỉ số có một `OPS_HISTORY_SPECS[tabKey]` (RPC, cột, tab backfill, cửa sổ hằng ngày).

1. **Sync hằng ngày**: dòng delegate trong `syncOneTab()` của `Code.gs` gọi `syncOpsTabWithHistory_(ss,tabKey,gid)`.
   Pick/Deli/FD chạy delta như cũ rồi upsert cả tab vào bảng lịch sử (Pick, Deli: D-14..D-1; FD: D-22..D-8, nếu
   source ngoài cửa sổ thì không ghi gì); CA1 chỉ chạy delta. Lỗi ở bước history làm cả tab thất bại và đi qua
   queue retry hiện có. Rollback: trả dòng đó về `syncOpsDeltaTab_`.
2. **Backfill một lần**: `backfillPickHistory()`, `backfillDeliHistory()`, `backfillFdHistory()` đọc tab
   `*_backfill_tmp`, chỉ nhận ngày từ thứ Hai cách 8 tuần trước tuần hiện tại đến hôm qua (FD: đến D-8); có ngày
   ngoài khoảng thì từ chối cả tab, không ghi gì. Gửi từng tuần, lô 5.000 dòng. Log tổng nguồn theo tuần để đối
   chiếu. Dừng sau 4,5 phút và báo chạy lại (upsert idempotent).

**Không để hở giữa backfill và sync**: cửa sổ Sheet chỉ phủ 14 ngày (FD 22 ngày), nên bảng lịch sử phải nhận
sync hằng ngày trước khi dữ liệu cuối của backfill rơi khỏi cửa sổ.

## Frontend: chế độ "Theo tuần"

- Toggle "Theo ngày / Theo tuần" trong `Report1MienVungHub` (cạnh các tab chỉ số). Không có ở trang `/snapshot`
  và màn tổng quan.
- [`WeeklyKpiTable.jsx`](../src/modules/ops-metrics/WeeklyKpiTable.jsx) + [`weeklyKpi.js`](../src/utils/weeklyKpi.js):
  gọi RPC, chạy `normalizeDashboardRows`, lọc theo client, Vùng, Loại Hub đang chọn, rồi cộng tử và mẫu theo tuần
  trước khi chia. Mỗi tuần hai cột (% và volume), tối đa 9 tuần, hàng Toàn quốc > Miền > Vùng, bấm Vùng để mở hub
  (10 hub nhiều đơn trễ nhất tuần mới nhất; FD là kho giao). Tuần chưa đủ 7 ngày ghi rõ số ngày.
- Bộ lọc khoảng ngày nằm ở header bảng theo tuần (`DateField` + preset 4 tuần / 8 tuần / Tất cả). Dữ liệu chỉ có theo tuần nên khoảng ngày giữ các tuần có ngày nằm trong khoảng; lọc đúng theo ngày cần RPC trả dữ liệu theo ngày. Bảng "Theo ngày" chưa có bộ lọc.
- Kết quả được nhớ theo bảng nguồn trong phiên (chuyển 1st Pickup <-> OPR không gọi lại); lỗi RPC hiện nút
  Thử lại. Không có cột "Tốt nhất 6 tuần" và "Cùng ngày tháng trước".
- Số theo tuần có thể lệch bảng theo ngày ở các ngày nằm trong cả hai nguồn nếu hai bảng được refresh ở hai
  thời điểm khác nhau; không trộn hai nguồn trong cùng một màn hình.

## Backfill Deli và FD (đã chạy 12/10) và cách đưa dữ liệu vào Sheet

Dữ liệu hub-ngày (khoảng 120 nghìn dòng mỗi bảng, hơn 8 MB CSV) được lấy từ Superset và nạp vào hai tab
`deli_backfill_tmp`, `fd_backfill_tmp` qua trình duyệt, rồi chạy `backfillDeliHistory()` / `backfillFdHistory()`.
Deli mất khoảng 1,5 phút, FD khoảng 1,5 phút; bảng Supabase khớp tổng nguồn theo tuần.

Cách nạp đã dùng và những điểm vướng, để lần sau làm lại cho nhanh:
- Giao diện SQL Lab chỉ hiển thị 200 dòng; nút Export to CSV qua giao diện trả 503 trong trình duyệt, nhưng gọi
  thẳng `GET /api/v1/sqllab/export/<id>/` bằng `fetch` trong trang thì trả đủ CSV (khoảng 30 giây, 8 MB). `<id>` lấy
  từ log mạng sau khi bấm Export.
- Chuyển sang TSV rồi ghi vào clipboard bằng một nút do script chèn vào trang (cần một lần bấm thật để có
  quyền ghi clipboard), sau đó Ctrl+V vào ô A1 của tab. Dán một lần cả bảng được (6,9 MB, FD); chia 30.000 dòng
  mỗi đoạn cũng được nhưng dễ hỏng ở bước đổi ô đích: **tab mới chỉ có 1.000 dòng, địa chỉ ô nằm ngoài
  lưới thì hộp "Invalid range" hiện ra và lần dán kế tiếp rơi vào chỗ cũ, ghi đè đầu tab**. Luôn đọc lại vùng được
  chọn sau mỗi lần dán và so tổng cột trong Sheet (chọn cột, đọc thanh trạng thái) với tổng nguồn trước khi
  chạy hàm backfill.
- Sheets bận vài chục giây sau mỗi lần dán lớn; không gửi thêm thao tác khi chưa thấy vùng chọn cập nhật.
- Project Apps Script `auto` thuộc một tài khoản Google khác với tài khoản mặc định của Chrome; Sheet thì cả
  hai tài khoản đều sửa được. Hàm backfill phải chạy từ tài khoản sở hữu project.
- Mỗi file Sheet chứa tối đa 10 triệu ô (tính cả ô trống của các cột đến Z): xoá các tab `*_backfill_tmp` sau
  khi xong, và nên xoá các cột thừa nếu cần chỗ.

Kết quả đối chiếu (nguồn Superset 12/10 so với bảng lịch sử): Deli 8 tuần 17/08 → 05/10 khớp từng số. FD 7 tuần
17/08 → 28/09 khớp số mẫu, và `fd_hoan_thanh` tuần 28/09 là 115.924 (sáng cùng ngày đo 115.934; tuần 21/09 và
14/09 lệch 2 và 1): FD đổi theo thời gian, các tuần cũ chỉ cập nhật khi còn nằm trong cửa sổ D-22..D-8 của sync.

### Hướng dẫn cũ (khi chưa làm)

1. BI ghi query hub-ngày ([deli](sql/deli_weekly_60d_test.sql), [fd](sql/fd_weekly_60d_test.sql), dòng `SELECT`
   cuối, không phải bản gộp tuần) vào tab `deli_backfill_tmp` / `fd_backfill_tmp`. Header đúng tên cột của
   `SELECT` cuối. Xoá các dòng ngoài cửa sổ (tab Deli: 17/08 → hôm qua; FD: 17/08 → D-8) trước khi chạy.
2. Chạy `backfillDeliHistory()`, rồi `backfillFdHistory()` trong editor Apps Script (mỗi hàm một lần).
3. Đối chiếu log nguồn theo tuần với bảng:
   `select week_start, count(*), sum(mau_deli), sum(ontime_deli_1st), sum(ontime_deli_odr) from kas_deli_history group by 1`
   (FD: `sum(mau_fd), sum(fd_hoan_thanh)` từ `kas_fd_history`). Số tham chiếu Superset ngày 12/10: Deli tuần 17/08
   có mẫu 2.164.220, 1st 2.059.806, ODR 1.908.562; FD tuần 17/08 có mẫu 2.154.540, hoàn thành 129.766.
4. Xoá các tab `*_backfill_tmp`.

## Ghi chú vận hành lần backfill Pick (12/10)

Lần chạy đầu bị guard từ chối vì tab còn 8.144 dòng ngày 13–16/08 (từ bản query 60 ngày cũ), không ghi gì;
sau khi xoá các dòng đó thì chạy được. Đọc và kiểm tra 123 nghìn dòng mất khoảng 1,5 phút, toàn bộ gần 3,5
phút, sát ngân sách 4,5 phút; nếu tab lớn hơn thì chia nhỏ tab. Khi đổi cửa sổ query, đối chiếu tuần đầu trước:
mốc quét `CreatedDate_Partition` 2 ngày làm tuần đầu thiếu 12 đơn, 7 ngày thì khớp.

## Kiểm thử

- `node scripts/apps-script/ops-history-sync.test.mjs` (73 kiểm tra, PGlite): `week_start` là thứ Hai; upsert
  no-op giữ id và `synced_at`; đổi giá trị thì update; khoá NULL không nhân đôi; không xoá ngày khác; lô trùng
  khoá, rỗng, quá lớn, thiếu ngày bị từ chối và không ghi gì; RPC đọc cộng tuần đúng, giới hạn `weeks`, dataset
  lạ, bảng rỗng; `anon` không gọi được RPC nào và không đọc được bảng, `authenticated` chỉ gọi được RPC đọc;
  retention (xoá đúng ngưỡng 90 ngày, từ chối `keep_days` dưới 70, chỉ `service_role`); Apps Script cho cả ba chỉ
  số (backfill chia lô, từ chối ngày ngoài cửa sổ, FD kết thúc D-8; sync hằng ngày đúng cửa sổ, CA1 chỉ delta,
  thiếu service key).
- `node --test src/utils/weeklyKpi.test.mjs` (12 test): cộng tuần rồi mới chia, xếp Miền/Vùng/hub, lọc client/vùng/
  loại Hub, nhãn tuần chưa đủ ngày, FD, chuẩn hoá KA/CK/GXT, cache và retry của `fetchWeeklyRows`.
- Kiểm thử không chạm Supabase hay Apps Script thật, và chưa kiểm tra giao diện trên trình duyệt có đăng nhập.
