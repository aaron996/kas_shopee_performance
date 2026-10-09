# Đồng bộ Google Sheet → Supabase

## Trạng thái ngày 09/10/2026

Luồng OPS đã chuyển từ full refresh sang sync phần thay đổi cho **Pick, Deli,
CA1 và FD**. **Leadtime vẫn giữ full refresh; tối ưu Leadtime đang pending.**
Datajob/query BI giữ nguyên. Chi tiết kỹ thuật, bằng chứng, retry và rollback:
[ops-incremental-sync.md](ops-incremental-sync.md).

Các thay đổi raw → HCM thuộc project khác, xem [raw-hcm-sync.md](raw-hcm-sync.md).
Cache dashboard được ghi ở [sync-cache.md](sync-cache.md); COD có tài liệu
[kas221-cod-suspicion-sync.md](kas221-cod-suspicion-sync.md).

## Nguồn và nơi chạy

- Sheet OPS: `1eZCDlKCrZVZAac6j-kBbKPgEmIQcRlTabAFzsl1zwGA`.
- [Project Apps Script auto](https://script.google.com/u/1/home/projects/1lMpmSpiIwGEdIioykYn3fjExBvncIsp8jlk2_J-uCOEwKDJRnXiaMCAZ/edit).
- Supabase: TTS Dashboard, project `iyjsihwgnzcytbojvoom`.
- Bảng: `kas_pick_data`, `kas_deli_data`, `kas_ca1_data`,
  `kas_leadtime_data`, `kas_fd_data`.

Apps Script đọc Sheet bằng quyền tài khoản có quyền truy cập nguồn. Cách này
không phụ thuộc link CSV public vốn bị chặn khi GHN hạn chế share ngoài domain.
Dashboard đọc Supabase qua `src/utils/supabaseSheetSync.js`; fallback CSV chỉ có
ích với nguồn còn public. Mỗi dòng Sheet vẫn là một dòng SQL để query/join.

```text
Sheet OPS → Apps Script (queue: mỗi execution một tab)
          → ops_kpi_sync_manifest + sync_ops_kpi_delta (Pick/Deli/CA1/FD)
          → sync_kas_leadtime_data (Leadtime full refresh)
          → Supabase tables → dashboard
```

## Mã nguồn nào là bản hiện hành?

- [ops-sync-live-20261009.gs](../scripts/apps-script/ops-sync-live-20261009.gs):
  snapshot đầy đủ **Code.gs** đã lưu ở project auto ngày 09/10. Các file COD,
  copy HNO và new.gs của project là file riêng, không nằm trong snapshot này.
- [ops-incremental-sync.gs](../scripts/apps-script/ops-incremental-sync.gs):
  helper delta dùng để review và kiểm tra local.
- [ops-kpi-incremental-sync.sql](../scripts/sql/ops-kpi-incremental-sync.sql):
  RPC bổ sung, đã áp dụng trên Supabase ngày 09/10.
- `scripts/apps-script/sync-to-supabase.gs`: bản full refresh cũ, có logic
  optional COD riêng; **không dùng để ghi đè project auto đang chạy delta**.

Thay đổi Git không tự cập nhật Apps Script hay chạy SQL. Bằng chứng áp dụng trực
tiếp trong phiên 09/10 được ghi riêng trong runbook; merge repo chỉ lưu lại mã
và tài liệu. Project dùng Script Property `SUPABASE_SERVICE_ROLE_KEY`;
không hardcode service key.

## Lịch chạy, retry và cách tổ chức project

BI dự kiến đổ dữ liệu khoảng 08:15; guard OPS không cho sync trước 08:30 theo
timezone Sheet Việt Nam. Trigger `nearMinute` có jitter, không phải giờ tuyệt
đối. Nếu trigger chạy sớm, code hẹn một lần chạy sau mốc này.

Giữ **một project auto**, các job có handler riêng. Queue KPI chạy lần lượt
Pick/Deli/CA1/Leadtime/FD; mỗi execution một tab, trigger tiếp tục cách ít nhất
60 giây. COD và copy HNO/SPB giữ trigger riêng. Tại thời điểm kiểm tra cuối
09/10 còn đúng ba trigger hằng ngày; trigger retry tạm đã được dọn.

Lỗi tạm thời retry sau 5/10/20 phút, tối đa bốn lần thử mỗi tab. Tab đã thành công
không gửi lại trong cùng job. ScriptLock chặn queue chạy chồng; watchdog 7 phút
được cài trước khi đọc Sheet/gọi RPC để phục hồi khi execution bị ngắt.

Chưa cần tách project. Chia file theo trách nhiệm là đủ để quản lý; tách project
khi khác tài khoản/quyền/người quản lý hoặc cần phát hành độc lập. Nếu bandwidth
tiếp tục lỗi, xem xét giãn giờ các job độc lập trước; **chưa đổi lịch** trong
phiên này. Tạo nhiều project cùng tài khoản không bảo đảm hết quota.

## Kiểm tra và vận hành

1. Dùng `showOpsSyncStatus` xem `pending/completed/failed`; xem log từng execution
   để biết `transferredRows` và kết quả RPC. `syncAllTabs` chỉ khởi động queue,
   không có nghĩa cả năm tab đã xong khi execution đầu kết thúc.
2. `syncOptimizedOpsTabs` chỉ khởi động Pick/Deli/CA1/FD qua queue; các hàm
   `syncPickOnly`/`syncDeliOnly`/`syncCa1Only`/`syncFdOnly` chạy riêng một tab.
   Các hàm chạy tay bỏ guard giờ, nên chỉ chạy khi nguồn đã refresh xong.
3. Snapshot không đổi sẽ có `transferredRows=0`, không đổi `synced_at`. Đây là
   thành công; `synced_at` phản ánh mutation, không phải heartbeat mỗi ngày.
4. HTTP 401/403: kiểm tra service key/quyền. HTTP 404: kiểm tra RPC đã được cài.
   Header, ngày hoặc payload sai sẽ giữ snapshot cũ; retry không chứng minh BI
   đã đổ đủ dữ liệu. Không reset state khi execution đang chạy.
5. Dashboard dùng cursor `id` và kiểm tra biên `id,synced_at` qua
   `src/utils/supabaseTableReader.js`; RPC delta vẫn cập nhật biên khi mutation.
   Timeout 15 giây, vượt 100 trang hoặc snapshot không đủ sẽ báo lỗi.

Rollback và phạm vi kiểm tra xem [runbook delta](ops-incremental-sync.md).
