# CSGT roadside-check motion prototype — 2026-10-29

## Deliverables

- `sequence-preview.gif`: 10 fps offline preview of the approximately 17-second sequence, including a plain paper prop. Camera is on the dismount side.
- `csgt-check-sequence-v1.glb`: skinned officer and animated paper prop; one clip `CSGT_CheckSequence`, frames 1–511 at 30 fps. Motorcycle is separate.
- `csgt-check-sequence-v1.blend`: editable authored action, repaired motorcycle reference, paper prop and review camera/lights.
- `sequence-sheet.png`: twelve key poses from the first review angle (before adding paper).
- `contact-review.png`: dismount/walking poses from the opposite angle to expose feet hidden by the motorcycle.
- `inspection-paper.png`: textured inspection pose after the paper was added.
- `verification.json`: actual exported GLB import checks, finite evaluated geometry, paper visibility and sampled boot clearance.

## Beats

| Frames | Approximate time | Action |
| --- | --- | --- |
| 1–30 | 0–1 s | Seated riding hold |
| 31–120 | 1–4 s | Release bars, step off and swing right leg over saddle |
| 121–200 | 4–6.6 s | Four short steps toward inspection position, settle into standing |
| 201–275 | 6.6–9.1 s | Extend hands, lower head, display plain paper prop |
| 276–293 | 9.1–9.7 s | Pivot to face return direction |
| 294–373 | 9.7–12.4 s | Walk back |
| 374–391 | 12.4–13 s | Pivot beside motorcycle |
| 392–481 | 13–16 s | Reverse mounting path and return hands/feet to riding pose |
| 482–511 | 16–17 s | Riding hold matching the beginning |

These are prototype action boundaries, not runtime state implementation. The clip contains root movement relative to the parked motorcycle. A runtime controller must account for that root movement instead of adding an independent walking translation.

## Implementation

Uses the previously created compact FK skeleton and skin, with analytically solved two-bone arm/leg poses and densely authored frame keys. Linear interpolation between 30 fps samples avoids unintended spline overshoot. Root and both feet use explicit paths; the end of each walk settles to the next standing stance. Pivots are stylized planted-turn approximations, not a fully authored heel/toe turn rig.

Ground-contact correction evaluates the skinned boot mesh for near-ground target feet and adjusts ankle targets before keying. The scene attachment is rotation Z=90 degrees and translation `(0.05, 0, 0.02)` in Blender coordinates; the independent GLB is exported without this scene attachment. The exported GLB has 20 joints including the locomotion root, one skin, and a paper object whose scale is animated in the same action slot group.

The paper is a simple blank prop, scaled into view during the inspection gesture. It is not transferred from another actor, and there is no finger-level gripping animation.

## Verification performed

- Viewed twelve key poses, a nine-pose contact sheet from the dismount side, and the final textured paper pose. GIF generated from 171 texture playblast frames at 10 fps; no real-device or runtime playback claim.
- Reimported the actual GLB in an empty Blender scene; confirmed one sequence clip, one skin and 20 joints. Sampled eleven points across the sequence for finite evaluated character geometry and paper scale behavior; paper visible at frame 235, hidden at frame 1.
- Sampled skinned boot clearance every five frames in the attached source scene. Minimum sampled boot Z is approximately -0.000606 units: within 1 mm if a scene unit represents one metre. This is sampled ground clearance, not a proof against all interpenetration.
- Automated check verifies start/end imported character bounds agree within 0.001 units, permitting a continuous sequence loop.
- Original sources and earlier rig/pose-only GLBs preserved. No additional Meshy generation or credits.

## Current acceptance level

**Motion prototype / blocking. Not final animation or runtime approval.** The full narrative sequence exists, but these limitations remain:

- Open gloves do not close around the bars or paper. Shoulder/hip/knee deformation remains limited by the generated mesh and basic skin.
- Dismount/remount path and saddle/boot clearances were reviewed visually; there is no exhaustive character-versus-motorcycle collision test. Body weight shift and turn foot pivots need another animation polish pass.
- Contact correction prevents the detected boot sinking at sampled frames; it does not certify zero foot sliding. The final walk settle and planted turns use a stylized approximation.
- No recipient GHN rider/driver, paperwork handoff, traffic-stop signal, conversation or actual penalty logic.
- No application changes, pursuit/random target selection, roadside vehicle coordination, idle cancellation/pause integration, deployment or device FPS verification.

Rebuild sequentially in headless Blender 5.2.1 with factory startup: `../animate-check.py`, then `../finish-check.py`. The second script adds the animated prop, reexports the character GLB and performs importer checks. Convert the final `frames/*.png` playblast sequence to GIF for the preview. Both scripts operate only on local files.
