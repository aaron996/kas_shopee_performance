# Lịch chấm SMS do Dev quản lý

Dev → COD SMS → **Lịch chấm SMS**: chọn giờ `HH:mm` theo giờ Việt Nam
(`Asia/Ho_Chi_Minh`, UTC+7), bật/tắt lịch, xem lần chạy kế tiếp, lượt tự động
gần nhất và 20 thay đổi gần nhất. API `/api/cod-sms-schedule` yêu cầu phiên
Dev cho cả GET và POST; RPC kiểm tra lại quyền theo JWT.

Lưu không chấm ngay. Giờ đã qua thì lần kế tiếp là ngày mai. Nếu hôm nay đã
có lượt tự động, đổi sang giờ muộn hơn cũng không tạo thêm lượt trong ngày VN.
Tắt lịch không hủy lượt đang chạy. Nút chấm thủ công trên báo cáo COD tiếp tục
dùng pipeline hiện có.

## Cơ chế

`set_cod_sms_schedule(boolean,text)` cập nhật cấu hình, job `cod-sms-daily`
trong `pg_cron` và audit trong cùng transaction. Giờ VN chuyển sang UTC:
09:00 → `0 2 * * *`; 05:30 → `30 22 * * *`.

Job gọi `cod_sms_private.dispatch()`, khóa cấu hình và tạo dispatch có
`run_date` duy nhất theo ngày VN. `pg_net` POST đến API chấm trên Vercel,
kèm secret từ Vault và `dispatchId`. API nhận bằng chuyển trạng thái nguyên tử
`queued → running` trước khi chấm; HTTP lặp không chấm lặp. Claim/fingerprint
từng đơn giữ nguyên, `force=false`.

Trạng thái: queued, running, completed, partial (có đơn lỗi/bị dừng), failed.
Lượt chưa kết thúc sau 10 phút hiển thị “Quá thời gian chờ”. Không tự retry
toàn lượt; Dev kiểm tra log batch rồi chạy thủ công khi cần. Nếu chấm xong
nhưng ghi trạng thái lỗi, không replay; đối chiếu lịch sử batch hiện có.
`pg_net` chờ 310 giây cho endpoint `maxDuration=300`; mạng, cold start và thời
gian chấm có thể gây trễ so với giờ đã chọn.

## Chuyển lịch production

Migration mặc định **tắt**, không phát sinh gọi model. Chuẩn bị backend và
secret trước khi deploy bản bỏ cron Vercel.

1. Áp dụng `supabase/migrations/20261007044825_cod_sms_schedule.sql` vào đúng
   project `iyjsihwgnzcytbojvoom`. Migration bật `pg_cron`, `pg_net`; Vault phải
   có sẵn. `cron.timezone` phải là GMT/UTC (migration kiểm tra).
2. Trong Supabase Vault lưu secret tên `cod_sms_scheduler_secret`, bằng đúng
   `COD_SMS_SCHEDULER_SECRET` của Vercel production. Đây là secret riêng cho
   scheduler SMS; không rotate `CRON_SECRET` của cron Vercel hiện có. Không
   đưa giá trị vào source/frontend, ảnh hay chat. Khi rotate secret scheduler,
   cập nhật Vault và Vercel cùng đợt, rồi deploy để runtime nhận giá trị mới.
3. Bằng SQL operator (postgres), nối endpoint production với secret:

   ```sql
   insert into cod_sms_private.runtime(id, endpoint, secret_id)
   select true, 'https://kas-shopee-performance.vercel.app/api/cron/cod-sms-score', id
   from vault.secrets where name = 'cod_sms_scheduler_secret'
   on conflict(id) do update
   set endpoint = excluded.endpoint, secret_id = excluded.secret_id;

   -- Phải trả đúng một dòng; không đọc decrypted_secret khi kiểm chứng.
   select r.endpoint, s.name as secret_name
   from cod_sms_private.runtime r join vault.secrets s on s.id = r.secret_id;
   ```

4. Deploy frontend/API và `vercel.json` cùng đợt. Cấu hình mới gỡ cron SMS
   khỏi Vercel; cron `ai-model-sync` giữ nguyên. Không duy trì hai scheduler.
   Endpoint mới yêu cầu dispatch hợp lệ, nên cron Vercel cũ còn sót không chấm.
5. Đăng nhập Dev → COD SMS → Lịch chấm SMS. Kiểm tra backend đã kết nối,
   chọn giờ rồi bật/lưu. Job bắt đầu từ lần kế tiếp. Log batch `trigger=cron`
   hiện có cũng được tính: nếu cron cũ đã chạy hôm nay, lịch mới tự bắt đầu
   từ ngày mai để tránh lượt bổ sung trong ngày chuyển đổi.
6. Kiểm chứng Dev lưu/đọc đúng giờ, Admin/User nhận 403; kiểm tra job/log.
   Sau lần đến hạn, đối chiếu HTTP delivery và lịch sử batch thật:

   ```sql
   select jobname, schedule, active from cron.job where jobname = 'cod-sms-daily';
   select id, run_date, status, created_at, started_at, finished_at, error_code
   from public.cod_sms_schedule_dispatches order by created_at desc limit 10;
   select jobid, status, start_time, end_time, return_message
   from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'cod-sms-daily')
   order by start_time desc limit 10;
   ```

PGlite kiểm chứng SQL/quyền/trạng thái; cron/net/Vault được thay bằng fixture.
Test này không chứng minh HTTP worker, secret hay lịch production thực tế.

## Rollback

Tắt lịch trong Dev Panel, xác nhận job inactive trước khi deploy lại bản
Vercel Cron cũ. Giữ bảng audit/dispatch để đối chiếu, không xóa điểm SMS.

## Kiểm chứng local ngày 07/10/2026

- 505 test hiện có và bổ sung qua; test SQL chạy lại sau khi thêm guard cho
  log cron Vercel cũ cũng qua.
- Build production qua; lint các file sửa/thêm qua. Cảnh báo chunk lớn của
  Vite vẫn có.
- Browser Codex `iab`, fixture riêng trong `output/playwright/sms-schedule/`:
  mở mục từ Dev Panel; lưu 05:30, hiển thị lần kế tiếp đúng ngày VN; tắt/lưu,
  audit; lỗi tải/thử lại; backend chưa kết nối không cho bật. Mobile 390px
  không tràn ngang (scrollWidth = clientWidth = 390).
- Fixture/screenshot bị gitignore, không có entry trong build production.
- Bản frontend/API chưa deploy; chưa chạy lượt chấm thật từ scheduler mới.

## Backend production đã chuẩn bị ngày 07/10/2026

- Áp dụng migration `20261007044825_cod_sms_schedule` trên project
  `iyjsihwgnzcytbojvoom`; tên file local đã khớp version Supabase ghi nhận.
  `pg_cron`, `pg_net`, Vault có sẵn; lịch mặc định 09:00 VN, đang tắt.
- Project Vercel xác nhận qua deployment production: `kas-shopee-performance`,
  repo `aaron996/kas_shopee_performance`, project
  `prj_eVubsl4pvlYsV144l2fi83Ur0HjV`.
- `CRON_SECRET` cũ là secret không thể đọc lại qua API. Đã tạo secret riêng
  `COD_SMS_SCHEDULER_SECRET`, chỉ phạm vi production, và lưu cùng giá trị vào
  Vault dưới tên `cod_sms_scheduler_secret`. Không thay `CRON_SECRET` cũ.
- Runtime nối endpoint
  `https://kas-shopee-performance.vercel.app/api/cron/cod-sms-score` với Vault.
  Kiểm tra nội bộ trả boolean xác nhận Vault khớp giá trị đã gửi sang Vercel;
  không xuất giá trị secret hoặc ghi secret vào workspace.
- Kiểm chứng SQL production trong transaction rollback: Dev đọc/lưu lịch;
  `cron.schedule`/`cron.alter_job` thật tạo đúng `30 22 * * *` cho 05:30 VN,
  inactive; tài khoản không có quyền Dev bị chặn. Audit/job kiểm tra được
  rollback hết, dispatch = 0, lịch vẫn tắt.
- Anon không gọi claim; authenticated không gọi dispatcher hoặc đọc bảng
  runtime. Advisor chỉ báo INFO `RLS Enabled No Policy` cho các bảng scheduler:
  thiết kế chặn truy cập bảng trực tiếp, dùng RPC có kiểm tra quyền.
  [Giải thích advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Còn deploy frontend/API mới để runtime Vercel nhận secret mới, gỡ cron SMS
  cũ theo `vercel.json`, rồi Dev bật lịch. Chưa kiểm chứng HTTP delivery thật.

Tài liệu: [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart),
[Vault](https://supabase.com/docs/guides/database/vault),
[Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
