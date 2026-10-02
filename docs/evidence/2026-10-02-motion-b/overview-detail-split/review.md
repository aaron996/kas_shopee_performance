# Overview / Region-Hub detail split — 2026-10-02

Moved the former OPS KPI card markup into OverviewKpiCards, keeping percentage, target, comparison, sparkline, volume, late/completed counts and FD empty state. Clicking a card changes the Overview trend. Comparison/date context stays consolidated below the cards. Mobile uses a horizontally scrollable card row.

Renamed report1 to Chi tiết Vùng/Hub in the registry and help entry, while retaining the persisted report1 identifier. Removed its summary KPI cards, sticky KPI summary and intervention strip. The detail surface keeps one metric selector and one hierarchy table, plus focus/fullscreen controls.

The existing drill-down handler keeps scope and opens the metric/Hub. The focus effect now accepts metric-only requests as well as region/Hub requests.

Validation: build and targeted lint passed; diff whitespace check passed; 374/374 repository tests passed. Codex IAB on explicitly labelled synthetic data verified selecting ODR updates the Overview trend, opening that chart selects ODR in detail, selecting a priority Hub opens its 1st Deli table and expands its region, and the target Hub row exists. Detail DOM contained exactly one table, zero summary cards and zero intervention strips. Desktop and 390px mobile reviewed; document width stayed within the mobile viewport. Production sync, authentication and export download were not exercised. Changes remain local.

Local review server restarted on 127.0.0.1:4382 after the prior process had stopped. The preview-only auth settings apply to that local server process.
