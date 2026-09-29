# COD suspicion sheet export (`nghi_ngo_COD`)

Pushes COD suspicion orders to the destination spreadsheet once a day. GHN
does not allow sharing these sheets outside the domain (service accounts
included), so the write runs as an Apps Script bound to the destination
spreadsheet under a GHN account. The app only computes the list:

```
Apps Script (destination sheet, ~10:15 VN)
  └─ GET /api/cod-suspicion-export   Authorization: Bearer <COD_EXPORT_API_TOKEN>
       └─ reads Supabase with the service role, returns { headers, rows, ... }
  └─ writes nghi_ngo_COD (overwrite) + nghi_ngo_COD_log (append new orders)
```

## Selection

A driver case is (suspicion type, driver). Its level is the same effective
level the app shows regular users:

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

## Tabs

| Tab | Behaviour |
| --- | --- |
| `nghi_ngo_COD` | Rewritten every run with the current list. |
| `nghi_ngo_COD_log` | Append-only. An order is added the first time it appears; later runs never add it again, even when its SMS, call or COD fields change. |

Columns: Loại nghi ngờ, Mã đơn, ID tài xế, Tên tài xế, Tỉnh giao, Mã bưu cục
(`warehouse_id` from "ID kho giao"), Tên bưu cục, Giá trị COD, Ngày kết thúc
giao, Mức nghi ngờ tài xế, Thời gian đồng bộ (Asia/Ho_Chi_Minh). Both tabs are
created on first run. Keep manual notes outside columns A–K of the rewritten
tab; they are cleared. A malformed API response leaves both tabs untouched.

## Schedule

The SMS cron (`0 2 * * *` UTC) fires somewhere in 09:00–09:59 VN on the Hobby
plan, so the Apps Script trigger runs at ~10:15 VN. The response carries
`snapshotSyncedAt` and `lastSmsRun`; the script logs a note if scoring is
still running.

## Setup

1. Set `COD_EXPORT_API_TOKEN` on Vercel to a long random value and redeploy.
2. In the destination spreadsheet: Extensions → Apps Script, paste
   `scripts/apps-script/push-cod-suspicion-sheet.gs`.
3. Script Properties: `COD_EXPORT_API_TOKEN` with the same value.
4. Run `dryRunCodSuspicionSheet()`, then `pushCodSuspicionSheet()`, then
   `createCodSuspicionSheetTrigger()` once.
