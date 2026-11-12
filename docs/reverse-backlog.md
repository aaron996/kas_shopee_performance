# Backlog Reverse

Subtab **Backlog Reverse** (Chi tiết Vùng/Hub, chỉ khi chọn SPE Reverse) hiển thị backlog L14D theo số lần gán x tuổi tồn x vùng.

## Luồng dữ liệu

1. BI đổ một ảnh backlog hằng ngày vào tab `reverse_backlog` của sheet OPS. Header: `snapshot_date, client_name, region, hub_type, assign_bucket (0 | 1-2 | 3+), age_bucket (1-3 | 4-7 | 8-14), backlog_orders`. Tổ hợp không có đơn có thể vắng mặt (= 0).
2. `scripts/apps-script/reverse-backlog-sync.gs` → `syncReverseBacklog()` ghi vào `public.kas_reverse_backlog` qua RPC `upsert_kas_reverse_backlog` (service role). Mỗi `snapshot_date` được thay trọn vẹn, ngày khác giữ nguyên để có snapshot tuần trước.
   - Tab phải có đúng một `snapshot_date` là hôm nay hoặc hôm qua, `client_name` là `SPE Reverse`, bucket hợp lệ và `backlog_orders >= 0`; sai thì không ghi gì.
   - Đặt trigger hằng ngày (~09:15, sau lúc BI đổ và sau sync Reverse 09:00) bằng cách chạy một lần `createReverseBacklogDailyTrigger()`. Script dùng chung `opsDeltaNormalizeRows_`, `opsDeltaRpc_`, `opsHistoryKey_`, `opsHistoryShift_` nên cần thêm sau `ops-incremental-sync.gs` và `ops-history-sync.gs`.
3. App đọc qua RPC `get_kas_reverse_backlog` (authenticated): snapshot mới nhất và snapshot gần nhất cách ít nhất 7 ngày để tính chênh lệch tuần trước.

## App

- Lọc theo vùng và loại Hub đang chọn. Vùng trống hoặc `N/A` hiện là "Chưa rõ vùng" và chỉ vào khi chọn tất cả vùng.
- Chưa có snapshot nào hiện thông báo riêng, khác với backlog bằng 0.
- Loading/lỗi/thử lại theo `docs/loading-states.md`; refresh giữ số đã có.
- Tab **Backlog** cạnh PUD là phần khác (backlog tuyệt đối theo ngày từ cột `mau_pud` của tab `reverse`).
