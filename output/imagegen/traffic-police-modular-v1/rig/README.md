# CSGT body rig v1 — 2026-10-29

## Delivered

- `csgt-officer-rigged-v1.glb`: independent skinned officer with three clips.
- `csgt-officer-rigged-v1.blend`: editable compact FK skeleton, skin weights, actions, cameras/lights.
- `pose-review.png`: rows Stand, Ride, Inspect; columns front, side, three-quarter.
- `riding-on-bike-sheet.png`: rider and repaired motorcycle together, three angles, preview only.
- `placement/placement_sheet.png`: manually positioned skeleton, front/side/top.
- `rig-report.json`: bones, skin-weight checks and rigid accessory assignments.
- `verification.json`: actual GLB roundtrip and sampled motion checks.

## Rig and binding

Compact scripted FK skeleton: one non-deforming root and **19 deform joints**, including pelvis/spine/chest/neck/head and bilateral arms/hands/legs/feet. Manually corrected head, neck and shoulder placement replaces the rejected automatic landmarks. This is a purpose-built game skeleton, not a Rigify-generated controller rig.

Skin uses deterministic spatial weighting across body/limb regions, evaluated equally on coincident UV seam vertices. At most three influences per vertex; all 6,581 source vertices weighted; zero unweighted vertices, over-four influence vertices or weight-sum errors. The weight audit's `empty_inside` tests were disabled; their empty arrays are not evidence of inside-volume coverage. No exact mirrored source-vertex pairs were found by the audit, so its mirror error is unavailable.

The head/helmet region is rigid to the head above the neck transition. Isolated radio/antenna/belt/buckle/loops are rigid to pelvis after a first render revealed radio distortion; the corrected poses were rendered again. There is no facial or individual finger rig. The hands keep the generated open-glove shape.

## Clips

| Clip | Content | Duration |
| --- | --- | --- |
| `CSGT_Stand` | Arms lowered, subtle torso sway | 2 seconds, 30 fps |
| `CSGT_Ride` | Seated riding hold with arms and legs posed | 2 seconds, 30 fps |
| `CSGT_Inspect` | Head inclined, both hands extended, small hand-height movement | 2 seconds, 30 fps |

Ride is a **pose hold**, not a pedalling/steering or dismount animation. Inspect is a gesture foundation; no papers/driver/vehicle interaction is present. Clips have matching start/end poses for looping. They do not provide walking, a mount/dismount transition, traffic signalling or a complete inspection sequence.

## Validation

- Viewed skeleton placement before posing, all three poses from three angles, and rider on repaired bike from three angles. Corrected the visibly deforming radio after the first review.
- Exported GLB contains one skin, 19 joints and all three named animations. Loaded the exported GLB in a new empty Blender scene at 30 fps.
- Compared deformed vertex positions in each imported clip at frame 16 against the authoring Blender file using nearest-vertex distance; all below the 0.001-unit acceptance threshold. Exact measured errors are in `verification.json`.
- Sampled nine frames of each imported clip and verified finite coordinates/bounds. This verifies the delivered clip/skin pipeline, not every possible future pose.
- Riding preview uses officer rotation Z=90 degrees, translation `(0.05, 0, 0.02)` in Blender Z-up coordinates beside the prepared motorcycle. This is a local preview attachment, not runtime alignment metadata.
- No new Meshy/API/auto-rig credits used. No original source model overwritten.

## Limits / next work

This is a visually reviewed **basic body rig**, not final production animation approval. Knee/hip folds are visibly angular under the seated pose, hands remain open, and close-up hand grip/seat/foot contact still merit refinement at the gameplay camera. No automated penetration, ground-foot sliding or complete joint range-of-motion acceptance is claimed. Facial expressions and finger grip require additional controls or mesh work.

Mount/dismount and walking must be authored and checked next if needed. Integration must also load character skin separately from the rigid bike, retain wheel pivots, and coordinate character clips with pursuit/roadside-stop states. No app behavior, deployment or real-device FPS work in this step.

## Reproduce

Run `../rig-officer.py` in headless Blender 5.2.1 with factory startup and python exit code 1. It reads the prepared A-pose blend and the preserved component inventory `accessory-components.json` (created by `../inspect-rig-components.py`) for rigid accessory membership. Then run `../verify-rig.py` for actual exported-file validation and bike pose previews. These scripts contain no provider calls or credentials.
