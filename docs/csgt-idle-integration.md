# CSGT in BXH idle — 2026-11-03

The existing idle traffic scene now includes one Vietnamese traffic-police motorcycle and a separately skinned officer. This follows asset-only PR #254. It is a decorative interaction: no penalty, KPI, rank, Hub record or table selection is created or changed.

## Behavior

- After entering idle, a patrol can select a random visible original GHN vehicle, either a bike or a truck. Ambient extras and reverse traffic are excluded. Selection waits for road/shoulder clearance; it can retry without stopping traffic.
- Patrol closes the gap with flashing beacon materials. The GHN vehicle brakes, pulls onto the shoulder, and remains fixed relative to the moving road.
- A 17-second officer clip dismounts, approaches the target, checks a plain paper prop, returns and remounts. The approach travels approximately 4.875 scene units. Police parks five units behind a bike or 3.7 behind a truck so the inspection reaches the cabin. Root movement is already in the GLB.
- The officer waits while the GHN vehicle has clearance to merge back. Patrol then departs and fades, with a randomized cooldown before another selection.
- Pause and hidden-tab behavior use the existing simulation clock. Idle-off cancels the interaction and restores ranking positions. An interrupted roadside target safely merges out of the shoulder. Replay, changed data and reduced motion reset traffic through the existing DriveClock lifecycle.

## Implementation

- `src/utils/scenePolice.js`: pure patrol state machine; `sceneIdle.js` coordinates stopping, lane clearance, recovery and road-relative motion.
- `PoliceTraffic.jsx`: independently cloned bike, officer skin and materials; shared cached geometry/textures; disposal of owned materials/mixer. Separate Suspense boundary keeps model loading from suspending the fleet. Models are requested only after idle first becomes active.
- `scenePoliceAnimation.js`: absolute clip sampling, including re-enabling LoopOnce after the previous check ends. No separate animation timer or React state updates per frame.
- `public/models/csgt-motorcycle-v1.glb`: 3,018,052 bytes, separate wheel pivots, forward +X, wheel axle Z.
- `public/models/csgt-check-sequence-v1.glb`: 3,229,668 bytes, one skin/20 joints, one approximately 17.033-second clip including final-frame hold. Runtime returns to the seated hold at 17 seconds.
- Editable assets/scripts and updated review sheets remain under `output/imagegen/traffic-police-modular-v1/`. Runtime copies match the source GLBs. No additional paid generation was submitted.

## Verification

- Full `npm test`: **856/856 passed** after final traffic fixes. Both vehicle types complete pursuit/check/release; parked targets track the road exactly; zero-step freeze, idle cancellation and exact ranking recovery are covered. Five seeded 180-second schedules include ambient actors and police-versus-vehicle overlap assertions.
- A test imports the shipped GLB's real geometry/skin/animation (omitting only image decoding in Node), checks its extended approach, and samples the same inspection pose after LoopOnce finishes and restarts.
- `npm run build`, scoped oxlint and `git diff --check` passed. The existing Vite large-chunk warning remains.
- Codex IAB local fixture uses the actual `RoadScene3D`, synthetic Hub records and React StrictMode. Observed checks on GHN bikes and trucks; the corrected truck approach reaches the cabin. Observed pause at a fixed inspection time, resume, idle-off return to rank, replay reset, reduced-motion reset, unmount/remount, region change and night lighting.
- Local screenshots: `output/playwright/csgt/bike-inspection.png` and `truck-inspection.png` (ignored QA artifacts). The fixture itself is ignored under `extracted/csgt-qa/`; it adds no debug controls to the delivered dashboard.
- Offline Blender reimport checks report minimum sampled boot Z approximately +0.000854 units. This is sampled flat-ground evidence, separate from runtime curved-road rendering.

## Limits

The generated character has open gloves, no finger rig or paper handoff, limited shoulder/hip deformation and stylized foot pivots. Camera angle or scenery may occlude part of an inspection, as with other scene actors. Local simulation and IAB checks do not certify exhaustive mesh collision freedom, target-device FPS, authenticated production data or final user art approval. Deployment status is reported separately from source and local verification.
