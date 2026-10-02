# Overview copy, chart and typography — 2026-10-02

- Repeated per-card date/comparison footers became one shared date and comparison legend. Exceptions (FD date/comparison) remain available on the individual card tooltip; missing data stays visible. Rounded differences display zero instead of negative zero.
- Overview uses a dedicated Recharts line chart with time-proportional X positions, labelled percentage Y axis, labelled target, native-sized dots and per-date tooltip. Linear segments do not imply intermediate observations. The percentage range adapts to actual values and target, with explicit ticks; there is no area fill or distorted SVG endpoint.
- Native buttons/inputs/selects/textareas inherit the app font. Heading defaults use the heading token. Added the missing font-body alias and converted the data-source code field to the mono token. Existing intentional role-specific families remain: Outfit headings, IBM Plex Sans body/controls, IBM Plex Mono table/code annotations.
- The ignored local QA entry now loads the same font stylesheet as the normal app entry.

Build passed; targeted lint clean; diff whitespace check passed; 374/374 existing tests passed. No new tests added for the CSS-only typography defaults or reversible visual layout.

Codex IAB QA on explicitly labelled sample data: desktop and 390px mobile, time/percentage ticks, target label, circular endpoint dimensions (5x5px), keyboard ArrowRight tooltip with date/value, missing FD data, computed font families on headings and controls. Mobile document width 385px inside 390px viewport. Browser error log empty. Font stylesheet link verified in the review DOM; production deployment was not performed.

The shared small sparkline in OPS cards remains separate from the new Overview chart. No aggregation, KPI target, data scope or authentication behavior was changed.
