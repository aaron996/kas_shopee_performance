# COD suspicion sheet export (`nghi_ngo_COD`)

Pushes COD suspicion orders to the destination spreadsheet once a day. GHN
does not allow sharing these sheets outside the domain (service accounts
included), so the write runs as an Apps Script bound to the destination
spreadsheet under a GHN account. The app only computes the list:

```
Apps Script (destination sheet, ~10:15 VN)
  └─ POST /api/cod-suspicion-export   Authorization: Bearer <COD_EXPORT_API_TOKEN>
       └─ reads Supabase with the service role, returns { headers, rows, ... }
       └─ inserts first-seen orders into cod_suspicion_export_log
  └─ overwrites nghi_ngo_COD

GET on the same endpoint is read-only (the script's dry run).
```

## Selection

Chỉ xét các đơn trong snapshot có `signal_count_over_p90 = true` ("Bất thường call log (so P90
hardcode)" = Có) và `call_verification_priority = 'Cao'` — cùng phạm vi với tab COD của app.
Các bước dưới tính trên tập đã lọc này.

A driver case is (suspicion type, driver). Its level is the same effective
level the app uses for regular-user alert filtering (the driver/order level
badges are hidden for regular users):

1. SQL level of the driver's highest `total_score` (High ≥ 18, Medium ≥ 15,
   otherwise Low).
2. If any of the driver's snapshot orders has a `scored` SMS assessment with
   `sms_score` ≥ the Dev Admin threshold (`cod_sms_escalation_config`, default
   1), the level rises one step: Low → Medium, Medium → High. Orders that are
   pending, failed or not scored yet add nothing, so their driver keeps the SQL
   level.

Every snapshot order of a Medium/High driver is exported. Drivers a Dev
concluded as `non_violation` (for that suspicion type) are excluded. Rows are
unique per (suspicion type, order code).

## Outputs

| Where | Behaviour |
| --- | --- |
| Sheet tab `nghi_ngo_COD` | Rewritten every run with the current list. Keep manual notes outside columns A–K; they are cleared. A malformed API response leaves the tab untouched. |
| Supabase `cod_suspicion_export_log` | One row per (suspicion_type, order_code), inserted the first time the order is pushed (`first_logged_at`) and never updated, even when SMS, call or COD fields change. Server-only (service role). |

Sheet columns: Loại nghi ngờ, Mã đơn, ID tài xế, Tên tài xế, Tỉnh giao, Mã bưu
cục (`warehouse_id` from "ID kho giao"), Tên bưu cục, Giá trị COD, Ngày kết
thúc giao, Mức nghi ngờ tài xế, Thời gian đồng bộ (Asia/Ho_Chi_Minh). The log
table stores the same fields plus `driver_alert_level` at first sight.

The 188 orders pushed on 2026-09-29 16:05 (when the log was a sheet tab) were
backfilled into the table with that timestamp.

## Schedule

The Apps Script export trigger runs at ~10:15 VN, originally after the Vercel
SMS cron's 09:00–09:59 VN window. SMS scheduling now moves to the Dev-managed
[Supabase Cron schedule](cod-sms-schedule.md). Changing the SMS time does not
reschedule the Apps Script export: keep scoring before export, or adjust that
trigger separately. The response carries
`snapshotSyncedAt` and `lastSmsRun`; the script logs a note if scoring is
still running.

## Setup

1. Set `COD_EXPORT_API_TOKEN` on Vercel to a long random value and redeploy.
2. In the destination spreadsheet: Extensions → Apps Script, paste
   `scripts/apps-script/push-cod-suspicion-sheet.gs`.
3. Script Properties: `COD_EXPORT_API_TOKEN` with the same value.
4. Run `dryRunCodSuspicionSheet()`, then `pushCodSuspicionSheet()`, then
   `createCodSuspicionSheetTrigger()` once.
