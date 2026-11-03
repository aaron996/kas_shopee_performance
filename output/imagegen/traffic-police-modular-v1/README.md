# CSGT modular assets v1

Created 2026-10-29, Asia/Saigon. User approved retaining and repairing the existing touring motorcycle and generating a separate officer in A-pose for later rigging/animation.

## Deliverables

| Asset | File | Triangles | Size | State |
| --- | --- | --- | --- | --- |
| Motorcycle | `motorcycle/csgt-motorcycle-prepared-v1.glb` | 6,878 | 3,018,052 bytes | Motorcycle only; separate front/rear wheel pivots |
| Officer | `officer/csgt-officer-apose-prepared-v1.glb` | 7,913 | 2,946,608 bytes | Independent A-pose mesh; no rig/skin/animation yet |

Editable copies: corresponding `.blend` files beside the GLBs. `modular-preview.png` is an offline preview of both independent models. It does not depict the officer posed on the motorcycle or a runtime scene.

## Motorcycle repair

Retained the original Meshy motorcycle design, CSGT panels, body texture, touring silhouette, panniers, engine/exhaust and wheel interiors. Original source under `../traffic-police-v1/meshy-t2/model.glb` remains unchanged.

- Removed the old officer, helmet, shoulder pieces, radio, belt fragments and helmet attachments identified by the complete 91-component review.
- Rebuilt fork segments and axle where the source was fused to the rider; rebuilt handlebars/grips and mirror supports.
- Added a faceted tank cover and saddle/under-saddle infill for areas previously hidden by the rider.
- Replaced rubber tyre geometry with circular low-poly toroids; original tyre texture contamination removed through flat rubber material. Wheel interiors remain from the source.
- Set one beacon blue and the other red, assigned dark saddle/mirror materials, and made the windshield transparent (`alphaMode: BLEND`).
- Created `csgt-motorcycle-body`, `csgt-motorcycle-wheel-front`, `csgt-motorcycle-wheel-rear`.
- Length normalized to 2.5 scene units, forward +X, glTF Y up. Wheel spin axis in glTF is Z; in Blender it is Y. Local wheel mesh origins are at axle centers.
- The derivative uses the previously inspected diagnostic components after positional welding. This changes the source's vertex/normal-seam representation and removed one tolerance-degenerate face in the diagnostic stage; it is a repaired derivative, not a triangle-preserving split of the original.

Rebuild: run `repair-motorcycle.py` using Blender 5.2.1 headless with `--factory-startup --python-exit-code 1`. It reads the preserved earlier audit `.blend`; no network calls.

## Independent officer generation

- Concept: `officer/csgt-apose-reference-v1.png`, built-in imagegen. Exact prompt: `officer/image-prompt.md`.
- Meshy Image to 3D task: `01a186a4-3e06-75a3-84ea-e17292959fb0`.
- Explicit `smart-topology`, `meshy-t2`, target 8,000 triangles, 2K base-color texture, no additional PBR, `pose_mode: a-pose`, GLB format.
- SUCCEEDED, consumed **15 credits**. Balance was 853 after the earlier combined model and is 838 after this generation. No new paid bike generation, retexture, auto-rig or motion job.
- Raw source: `officer/meshy/model.glb`; prepared derivative has applied transforms, feet at ground zero, centered body, height 1.8 units. Blender facing -Y; glTF facing +Z.
- Inspected six textured views and matcap/wire views. Both arms and legs are independent of the torso in the reference stance; no motorcycle geometry is attached. Clothing, helmet, gloves, boots and radio are present.
- This improves source suitability for rigging, but does not establish deformation quality. Fingers/insignia remain simplified, with minor Meshy surface/texture artifacts.

## Verification completed

- Reimported both exported GLBs into a clean review process and rendered the actual files. No external texture/buffer dependencies.
- Bike export: 3 meshes, 13 primitives, 9 materials, one embedded source texture. Character export: 1 mesh/primitive/material, one embedded 2K texture. No skin or animation on either file.
- Verified both wheel pivots remain fixed during rotation. Rendered 0/45/90/180-degree states.
- Sampled each wheel at 72 angles through a complete revolution. Maximum ground-contact variation: front 0.001219 units, rear 0.001210 units (about 1.2 mm if one scene unit is one metre). Minimum ground Z is zero within floating-point tolerance.
- Officer transform/ground checks pass after reimport and normalization. Texture, anatomy and silhouette viewed from front/back/both profiles/two diagonal views.
- Evidence: `verification.json`, `motorcycle/wheel-spin-review.png`, `motorcycle/motorcycle-review.png`, `officer/officer-review.png`, `officer/geometry-review/review_sheet.png`, `officer/audit.json`.
- Raw provider responses with expiring access-bearing asset links are ignored. No credentials are stored with these deliverables.

## Status and remaining work

### BXH runtime integration — 2026-11-03

The separate bike and officer are now consumed by `PoliceTraffic.jsx` and the idle traffic state machine. The check sequence was rebuilt with an approximately 4.875-unit approach so the officer reaches the stopped GHN vehicle. See [integration notes](../../../docs/csgt-idle-integration.md) for behavior, verification and remaining art/device limitations. Earlier statuses below describe the asset stages when they were authored.

### Subsequent motion sequence — 2026-10-29

A complete 17-second motion prototype is now in `animation/`: dismount, walk, inspection gesture with blank paper, return and remount. See `animation/README.md` for acceptance limits and `animation/sequence-preview.gif` for preview. This supersedes the earlier absence of walking/mount/dismount for the new sequence derivative. It is blocking/motion-prototype quality; runtime pursuit/stop coordination is still unimplemented.

### Subsequent approved rig stage — 2026-10-29

Basic body rig now delivered in `rig/csgt-officer-rigged-v1.glb` and matching `.blend`; details in `rig/README.md`. It has 19 deform joints, one skin and Stand/Ride/Inspect clips. Poses, bike preview and GLB roundtrip were inspected. This supersedes the earlier "no rig" status for the **new rigged derivative only**; original A-pose deliverables remain unrigged. Full walking/dismount/paperwork interaction and runtime integration are still pending.

### Status at the earlier modular asset delivery

The modular asset preparation requested in this step is complete. **Not yet animation-ready or integrated into BXH.**

1. Rigging needs manually corrected joint placement: the automatic cross-section detector placed neck/head landmarks in the helmet and made some torso/shoulder placement errors. Its empty `notes` array is not acceptance; `officer/audit.json` explicitly rejects those landmarks for binding.
2. Add and bind the humanoid rig, keep helmet/radio sufficiently rigid, check shoulders/elbows/hips/knees under stress poses, then fit riding and standing poses to this motorcycle. No automatic rig success is claimed.
3. Bike saddle/tank infill is simplified; inspect in the actual gameplay camera and alongside the posed officer before art approval. Source engine/pannier surfaces retain some Meshy roughness.
4. Current bike material separation produces 13 primitives, which may merit consolidation during runtime preparation. No draw-call/FPS/device performance result is claimed.
5. Runtime pursuit, random selection, roadside stops, dismount/walking/paperwork animation, pause/reduced-motion rules and deployment are not implemented in this asset step.

Official API references checked: [Image to 3D](https://docs.meshy.ai/en/api/image-to-3d), [pricing](https://docs.meshy.ai/en/api/pricing). Current textured T2 generation price is 15 credits per 2K request.
