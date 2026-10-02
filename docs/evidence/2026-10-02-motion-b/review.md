# Approved motion B integrated into GHN

Local source implementation, 2 October 2026. No commit, push, merge or deployment.

## Implemented

- New Overview entry backed by the existing OPS aggregation, scoped KPI cards, priority Hub warnings and metric history. Saved report selections remain restorable.
- Collapsed navigation by default; expand button directly below the logo. Registry supplies navigation identity, icon and tooltip detail across desktop/mobile.
- Approved multipart hover choreography copied from motion B; spring icon transitions through the shared MorphIcon wrapper. Overview and OPS share the approved 1-second base timing; clock hands use a 1.8-second sweep, with 360° minute / 30° hour rotation.
- Secondary header/table actions use labelled icons and hover/focus tooltips. Filters, targets, dates, freshness and warnings remain visible.
- Selection indicators, keyboard-operable OPS tabs, reduced-motion rules and responsive/dark surfaces.
- Overview uses the OPS chat context accepted by the existing server protocol. Snapshot copy/latest-day controls retain their previous visible labels.

## Verification

- Production build passes. Vite still reports a main-chunk size warning.
- 374/374 Node tests pass, including restoring Overview and prior OPS views.
- Targeted lint on edited components is clean; repository-wide lint passes with existing warnings elsewhere.
- IAB only, task-owned tabs: desktop Overview/OPS, sidebar expansion below logo, tooltip on keyboard focus, dark mode, selecting a priority Hub opens the correct OPS metric and region, arrow-key metric selection, empty-region filtering and reset, Client switching.
- Mobile 390 × 844: Overview and OPS have no document horizontal overflow; navigation retains all six regular-user modules.
- Browser console has no errors in the final QA tab.
- CSV control clicked; IAB download-event capture timed out, so downloaded file contents were not browser-verified. CSV generation and context logic remain unchanged.

## Preview boundary

`http://127.0.0.1:4382/motion-review.local/index.html?scope=SPB` renders the actual React app with existing synthetic test datasets and an explicit QA badge. The local harness is ignored by Git and excluded from the production entry. It uses the existing development-only local preview user and does not call Supabase/Google Sheets.

`http://127.0.0.1:4382/` is the ordinary app entry. Under the current local preview configuration it correctly shows an empty-data state until data is supplied. Production authenticated data and COD services have not been exercised locally.

Evidence: home-desktop.jpg, ops-desktop.jpg, home-mobile.jpg, ops-mobile.jpg, ops-dark.jpg. Sample dataset values vary between harness reloads.
