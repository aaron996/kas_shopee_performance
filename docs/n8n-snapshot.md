# n8n daily Telegram report — screenshots of the real dashboard

The n8n workflow `[KAS] vinhlt - Daily Report - Pick/Deli/Ca1 to Telegram`
(`iGVM6IXpZrLrAD6H`) sends one picture per report table every morning. It
used to build its own HTML from `v_kas_pick_agg` / `v_kas_deli_agg`, which
meant every dashboard change (new vùng such as `HCM - KA`, region order,
colours, columns) had to be re-implemented in n8n. It now screenshots the
dashboard itself, so the picture is whatever the dashboard renders.

## Flow

1. n8n `POST /api/snapshot-token` with `Authorization: Bearer <SNAPSHOT_SECRET>`
   → `{ token, expiresAt }` (valid 30 minutes).
2. For each table n8n asks the screenshot service
   (`ws.ahamove.com/pptraas/screenshot?url=…`, **no `size` param** so it
   captures the full page) to open:

   ```
   https://kas-shopee-performance.vercel.app/snapshot?report=pick&table=1st&client=SPB&excludeHubTypes=Ahamove&token=<token>
   ```
3. `/snapshot` (src/snapshot/SnapshotPage.jsx) calls
   `GET /api/snapshot-data?report=…&client=…&token=…`, which reads the raw
   `kas_*_data` rows with the service role (the tables are `authenticated`-only
   and the screenshot browser has no login). The page then runs the dashboard
   pipeline — `reassignKaRegion`, the Vùng / Loại Hub filter, `Report1MienVungHub`
   or `Report5LaneCa1` — and renders just that one table.

The long-lived secret never appears in a URL; only the short-lived token goes
through the external screenshot service.

## URL parameters

| param | values |
| --- | --- |
| `report` + `table` | `pick` + `1st` / `opr`, `deli` + `1st` / `odr`, `fd`, `ca1` + `intra_city` / `intra_region` / `cross_region` / `cross_metro` / `cross_metro_star` |
| `client` | `SPB` (default) or `SPE`; ignored for Ca1 (source has no client split) |
| `excludeHubTypes` | comma list, same as unticking those types in "Loại Hub" (the Telegram report excludes `Ahamove`) |
| `token` | from `/api/snapshot-token` |

The page sets `<html data-snapshot="ready|error">`; on error it renders the
message in red so a broken picture is obvious in Telegram.

## Config

- Vercel: `SNAPSHOT_SECRET` (Production), plus the existing `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`.
- n8n: a Header Auth credential with `Authorization: Bearer <SNAPSHOT_SECRET>`.

Preview deployments sit behind Vercel SSO, so the screenshot service can only
reach the production domain.
