# n8n daily Telegram report — screenshots of the real dashboard

The n8n workflow `[KAS] vinhlt - Daily Report - Pick/Deli/Ca1 to Telegram`
(`iGVM6IXpZrLrAD6H`) sends one picture per report table every morning. It
used to build its own HTML from `v_kas_pick_agg` / `v_kas_deli_agg`, which
meant every dashboard change (new vùng such as `HCM - KA`, region order,
colours, columns) had to be re-implemented in n8n. It now screenshots the
dashboard itself, so the picture is whatever the dashboard renders.

## Flow

n8n order: Cron → Get Snapshot Token → Read App Summary → Danh sach bang
can chup → 9 × (Fetch Screenshot) → 9 × send → Only One Item → Build Nhan Xet
→ send. The summary is fetched before any picture goes out, so the Nhận xét
message follows the last picture immediately (there used to be a fixed 75s
Wait node there; photos are sent one by one, each after Telegram confirms the
previous one, so ordering needs no wait). If the summary call fails the 9
pictures still go out and only Build Nhan Xet errors.

1. n8n `POST /api/snapshot-token` with `Authorization: Bearer <SNAPSHOT_SECRET>`
   → `{ token, expiresAt }` (valid 30 minutes).
2. For each table n8n asks the screenshot service
   (`ws.ahamove.com/pptraas/screenshot?url=…&size=1280,100&fullPage=true`) to
   open the URL below. `fullPage=true` captures the whole page (without it only
   a 1280×800 viewport); the small `size` height makes the capture end where the
   content ends instead of padding short tables to 800px.

   ```
   https://kas-shopee-performance.vercel.app/snapshot?report=pick&table=1st&client=SPB&token=<token>
   ```

   The scope is the dashboard default (every vùng and hub type, Ahamove
   included in its vùng, as the dashboard shows it).
3. `/snapshot` is rewritten (vercel.json) to `api/snapshot-page.js`, which
   checks the token, reads the raw `kas_*_data` rows with the service role (the
   tables are `authenticated`-only and the screenshot browser has no login) and
   returns the app's `index.html` with those rows embedded as a JSON block.
   src/snapshot/SnapshotPage.jsx then runs the dashboard pipeline —
   `reassignKaRegion`, the Vùng / Loại Hub filter, `Report1MienVungHub` or
   `Report5LaneCa1` — and renders just that one table.

   The rows must be embedded: pptraas captures once the network has gone
   quiet, and a data fetch issued after page load (several seconds for the
   Pick/Deli tables) lost that race and produced blank pictures.
   The old `GET /api/snapshot-data` fallback was removed to stay under Vercel
   Hobby's 12-function cap; without embedded rows (plain Vite dev) the page
   shows an error, so test it with `vercel dev`.

The long-lived secret never appears in a URL; only the short-lived token goes
through the external screenshot service.

## Nhận xét D-1

`GET /api/snapshot-summary?client=SPB&token=…` → `{ text, markdown, sections }`,
built by src/utils/executiveSummary.js — the same module behind the
dashboard's "Nhận xét D-1" modal. n8n sends `markdown` (Telegram parse_mode
Markdown). Each section's D-1 is its latest day with volume: deliveries are
never due on Sunday, so on Monday Giao hàng compares Saturday with the
previous Saturday instead of two empty Sundays. "Top vùng" lists the 3 vùng
with the most late orders on D-1 (total − on-time for 1st Pickup / 1st Deli,
absolute count, ties by lower %), not the lowest % — a small vùng with a
handful of orders must not outrank the big ones.

## URL parameters

| param | values |
| --- | --- |
| `report` + `table` | `pick` + `1st` / `opr`, `deli` + `1st` / `odr`, `fd`, `ca1` + `intra_city` / `intra_region` / `cross_region` / `cross_metro` / `cross_metro_star` |
| `client` | `SPB` (default) or `SPE`; ignored for Ca1 (source has no client split) |
| `excludeHubTypes` | optional comma list, same as unticking those types in "Loại Hub" (the Telegram report does not use it) |
| `hubTypes` | optional comma list, the opposite: keep ONLY these types (`hubTypes=CK` for the CK-only pictures: `pick`/`deli` × `1st`/`opr`/`odr`). Wins over `excludeHubTypes` |
| `token` | from `/api/snapshot-token` |

The page sets `<html data-snapshot="ready|error">`; on error it renders the
message in red so a broken picture is obvious in Telegram.

## Config

- Vercel: `SNAPSHOT_SECRET` (Production), plus the existing `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`.
- n8n: a Header Auth credential with `Authorization: Bearer <SNAPSHOT_SECRET>`.

Preview deployments sit behind Vercel SSO, so the screenshot service can only
reach the production domain.

## Hub type CK

`reassignKaRegion` (src/utils/dataProcessor.js) re-types a Pick/Deli/FD row as
hub type `CK` when the hub name contains `CK` or its `wh_id` is on the CK
warehouse list (same rule as the BI query). In HCM and HNO those rows also move
into their own vùng, `HCM - CK` / `HNO - CK` (same idea as `HCM - KA`), listed in
`MIEN_REGIONS`, so the normal pictures show them with no n8n change. A CK hub in
another region only gets the hub type. `hubTypes=CK` still works if a CK-only
picture is ever wanted.

## Job HNO dùng chung nguồn

n8n `[KAS] vinhlt - Daily Report - HNO to Telegram` (`xh2oJxXZkWnolmSj`) từng đọc
thẳng `kas_pick_data` / `kas_deli_data` với `region=HNO&hub_type=BC&client_name=SPB`,
nên lệch số với app: app chạy `reassignKaRegion` (hub KA / CK tách sang
`HNO - KA` / `HNO - CK`, đổi hub type) rồi mới lọc, còn job HNO thì không, và bỏ
sót hub type `GXT`.

Giờ job HNO lấy rows từ app, cùng pipeline với job tổng hợp (token từ
`/api/snapshot-token`, như trên):

```
GET /api/snapshot-summary?view=hno-rows&report=pick|deli&client=SPB&token=<token>
→ { rows: [ { report_date, hub, mau_pu, ontime_pu_1st, … } ] }
```

Phạm vi: client `SPB`, vùng `HNO` (sau `reassignKaRegion`), hub type `GXT` + `BC`
(`scopeHnoReportRows` trong src/utils/snapshotView.js). Endpoint dùng chung file
`snapshot-summary` để không thêm function (Vercel Hobby cap 12). Node n8n
`Build HTML HNO` vẫn tự gộp theo hub / tuần như cũ, chỉ đổi nguồn rows.
