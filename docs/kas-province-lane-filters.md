# KAS-317: bộ lọc Province và Lane

## Thiết kế
- Bảng hub-level hiện có (`kas_*_data`, `*_history`, `*_weekly`, `*_monthly`, `kas_reverse_history`) **giữ nguyên**, vẫn là nguồn khi không lọc.
- Bảng chi tiết mới, grain hub/ngày/client/province(/lane), chỉ có số cộng được, **không có benchmark**:
  `kas_pick_detail`, `kas_deli_detail`, `kas_fd_detail`, `kas_reverse_detail` (migration `20261127100000_kas_province_lane_detail.sql`).
- Không tái sử dụng `kas_deli_lane_daily`: grain là (ngày, lane, vung_giao, client, hub_type), không có hub và province.
- Tuần/tháng: không có bảng weekly/monthly chi tiết. `get_kas_detail_compact(dataset, grain, ...)` cộng thẳng từ bảng ngày theo `day|week|month` sau khi lọc. Đơn giản hơn (không trigger, không refresh) và chỉ chạy khi người dùng bật bộ lọc, index `(province, report_date)` thu hẹp số dòng đọc. Nếu đo thấy chậm thì thêm bảng cộng sẵn như `kas_*_weekly`.
- RPC: `upsert_kas_{pick,deli,fd,reverse}_detail(date_from, date_to, rows)` (service_role), `get_kas_detail_compact`, `get_kas_detail_options` (authenticated), `prune_kas_detail` (90 ngày, pg_cron 03:40 VN).
- Benchmark `best_l6w_*`, `sameday_lm_*` chỉ nằm ở bảng `*_data` (grain hub). Không code nào cộng hoặc lấy trung bình chúng theo province/lane; chế độ lọc không hiển thị benchmark.

## Apps Script
- `ops-incremental-sync.gs`: thêm `opsDeltaCollapseRows_`. Khi header có `province`, gộp về grain hub: cộng cột đếm, benchmark lấy một giá trị (lệch giữa các dòng cùng hub thì dừng cả tab). Dùng trong `syncOpsDeltaTab_`, `opsHistoryRows_` (history/backfill) và `reverseRows_`. Header chưa có `province` thì không đổi gì.
- `ops-province-lane-sync.gs` (file mới): `syncOpsDetailFromTab_` / `syncOpsDetailFromSheet_` đẩy dòng chi tiết sang RPC detail. Cửa sổ: Pick/Deli/Reverse D-14..D-1, FD D-22..D-8, phải có đủ ngày cuối; sai cửa sổ thì không ghi. Deli/FD cần cả `province` và `lane`, Pick/Reverse cần `province`, thiếu thì bỏ qua và ghi log.
- `ops-history-sync.gs` (`syncOpsTabWithHistory_`) và `reverse-history-sync.gs` (`syncReverseHistory`) gọi luồng chi tiết sau luồng cũ, chỉ khi file mới đã được dán vào project.
- Thứ tự triển khai: (1) duyệt và áp migration, (2) dán các `.gs` đã sửa + file mới, (3) datajob mới chạy. Dán `.gs` trước khi datajob đổi là an toàn (chuyển tiếp).
- Dữ liệu chi tiết bắt đầu từ lần chạy đầu sau khi datajob đổi; lịch sử cũ không có province nên không backfill được từ bảng hiện có.

## Front-end
- Theo `DESIGN.md` ("Scope filters live in the header"), bộ lọc nằm ở header (`src/components/Header.jsx`), không vẽ trong module:
  - **Tỉnh thành** là sub-filter của popover Vùng (icon MapPin), hai tab con "Vùng" và "Tỉnh thành". Chỉ có ở Chi tiết Vùng/Hub.
  - **Lane** là popover riêng (icon Route) cạnh Loại Hub, chỉ hiện khi chỉ số đang xem thuộc Deli/FD (1st Deli, ODR, FD).
  - Danh sách lấy từ `get_kas_detail_options` qua `useDetailOptions`; không chọn gì nghĩa là không lọc. "Đặt lại" xoá cả Tỉnh thành và Lane.
- State `detailScope` nằm ở `App.jsx`; `Report1MienVungHub` nhận `detailScope` và báo chỉ số đang xem qua `onDetailDatasetChange` để header biết có Lane hay không.
- Bật bộ lọc: "Theo ngày" chuyển sang `DailyRangeKpiTable` (mặc định 14 ngày gần nhất), "Theo tuần"/"Theo tháng" sang `WeeklyKpiTable` (grain = `period`), cả hai đọc `get_kas_detail_compact`. Không có benchmark; bảng ghi chú rõ và có huy hiệu `Province:` / `Lane:` (`ScopeBadges`). Tắt bộ lọc: luồng cũ không đổi.
- Chưa áp dụng cho Tổng quan MTD, xếp hạng 3D, chat AI, export và tab Backlog Reverse.

## Kiểm tra sau khi áp migration và có dữ liệu
Tổng bảng chi tiết (không lọc) phải bằng bảng hub-level cùng ngày, sai lệch 0 (đổi `deli` thành `pick`, `fd`, `reverse` và cột tương ứng):
```sql
select h.report_date, h.mau_deli - d.mau_deli as d_mau, h.ontime_deli_1st - d.ontime_deli_1st as d_o1, h.ontime_deli_odr - d.ontime_deli_odr as d_odr
from (select report_date, sum(mau_deli) mau_deli, sum(ontime_deli_1st) ontime_deli_1st, sum(ontime_deli_odr) ontime_deli_odr from public.kas_deli_history group by 1) h
join (select report_date, sum(mau_deli) mau_deli, sum(ontime_deli_1st) ontime_deli_1st, sum(ontime_deli_odr) ontime_deli_odr from public.kas_deli_detail group by 1) d using (report_date)
where (h.mau_deli, h.ontime_deli_1st, h.ontime_deli_odr) is distinct from (d.mau_deli, d.ontime_deli_1st, d.ontime_deli_odr)
order by 1;
```
Kết quả rỗng là khớp. Test tự động: `tests/api/kas-detail-db.test.mjs`, `scripts/apps-script/ops-province-lane-sync.test.mjs`, `src/utils/weeklyKpiDetail.test.mjs`.
