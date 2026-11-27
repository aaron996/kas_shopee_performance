# CSGT motorcycle + seated officer — Meshy T2 v1

Created 2026-10-29 (Asia/Saigon). User authorized Smart Topology generation and requested easier future separation of officer and motorcycle.

## Delivered

- `csgt-motorcycle-turnaround-v1.png`: four-view concept.
- `csgt-right-profile-v1.png`: single right-profile input, isolated using built-in image_gen from the concept. This is regenerated image content, not a pixel-identical crop.
- `meshy-options.json`: explicit provider configuration.
- `meshy-t2/model.glb`: downloaded source model.
- `meshy-t2/thumbnail.png`: Meshy preview, visually inspected.
- `inspection.json`: structural inventory; recreate with `python inspect-glb.py`.

## Submission

- Task: `01a1868f-2ba3-74f3-848f-4fc502e282f3`.
- Meshy CLI 0.6.0, Image to 3D, `model_type: smart-topology`, `ai_model: meshy-t2`.
- T2 selected for documented native separated parts; no guarantee of semantic character/vehicle separation.
- Requested 10,000 triangle target, 2K base-color texture, no extra PBR maps, GLB format. No pose override, to preserve riding pose.
- One paid submission. SUCCEEDED, consumed 15 credits; balance 868 before, 853 after.

## Result and limits

- 3,201,628 bytes; 10,638 triangles; one mesh, one material, one embedded image; no skeleton or animations.
- 91 connected components after welding positions rounded to six decimals. These are geometric components, not semantic labels. Component count does not prove that the entire officer can be removed cleanly from the bike.
- Provider thumbnail shows seated officer, white touring motorcycle, front/rear wheels, panniers, windshield, yellow helmet and tan uniform. This is thumbnail review only, not full-angle mesh approval or runtime testing.
- Next preparation would identify officer/body/wheel components, inspect hand-handlebar, seat and foot contacts, and determine whether hidden surfaces need rebuilding. Rigging and dismounting animation require further work.
- No runtime integration, wheel pivots, rig, animations, commit, push or deployment in this step.
- Raw provider responses/metadata are ignored because they contain expiring asset links.

## Follow-up quality review — 2026-10-29

See `review/REPORT.md` and `review/neutral-sheet.png`. Six-angle textured renders, geometry review, current-rider style comparison and isolated wheel/person checks completed in headless Blender. Retain as a repairable source for seated driving; not approved as runtime-ready or suitable for dismount animation. Main finding: officer component includes bike geometry. Wheel assemblies can be grouped, but texture cleanup and runtime pivots remain pending. No additional Meshy credits spent.

## Modular preparation — subsequent approved step

See `../traffic-police-modular-v1/README.md`: repaired motorcycle-only derivative with independent wheel pivots, plus a newly generated independent officer A-pose. Original combined source remains unchanged. New officer generation consumed 15 additional credits; no new bike generation. Humanoid rigging and runtime behavior remain pending.

## Official references checked

- https://docs.meshy.ai/en/api/image-to-3d — T2 native separated parts, Smart Topology parameters.
- https://docs.meshy.ai/en/api/pricing — 15 credits for textured T2 at 2K.
- https://docs.meshy.ai/en/api/auto-split — Auto Split does not support Smart Topology and does not preserve textures.
