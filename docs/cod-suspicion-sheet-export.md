# COD suspicion sheet export (`nghi_ngo_COD`)

Pushes COD suspicion orders to the destination spreadsheet after the daily SMS
scoring run.

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
tab; they are cleared.

## Schedule

- `/api/cron/cod-sms-score` (02:00 UTC = 09:00 VN) scores SMS, then runs the
  export in the same invocation, also when scoring fails or is disabled.
- `/api/cron/cod-suspicion-export` (03:30 UTC) re-runs only the export as a
  fallback. Both writes are idempotent, so running it twice is harmless. It
  accepts `Authorization: Bearer <CRON_SECRET>` for manual or n8n calls.

## Setup

1. Create a Google Cloud service account, enable the Google Sheets API and
   download its JSON key.
2. Share the destination spreadsheet with the key's `client_email` as Editor.
3. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (the whole JSON) on Vercel. Optional:
   `COD_EXPORT_SPREADSHEET_ID`, `COD_EXPORT_SHEET_NAME`,
   `COD_EXPORT_LOG_SHEET_NAME`.

Without `GOOGLE_SERVICE_ACCOUNT_JSON` the export reports `skipped` and the SMS
cron is unaffected.
