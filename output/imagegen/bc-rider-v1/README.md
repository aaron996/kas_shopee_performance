# GHN BC rider + motorcycle — v1

Concept and generation inputs for the BXH BC vehicle, 2026-10-15.

- Original approved concept: `ghn-bc-rider-turnaround-v1.png`.
- Four extracted inputs: `views/front.png`, `views/left.png`, `views/back.png`, `views/right.png`.
- Download bundle: `ghn-bc-rider-four-views-v1.zip`.
- `views/manifest.json` records source and crop hashes. Crops retain original subject pixels and scale; only direction text in the empty profile margins was removed, then each view was padded to 700×560.
- Meshy task: `01a13ea8-83da-75b6-8686-41cbbd5ff92d`, Multi-Image to 3D, first image front.
- Requested configuration: Meshy 7.1, standard geometry, triangle remesh target 10,000 polygons, 2K base-color texture, no extra PBR maps, image enhancement off, lighting removal on. Requested both final and pre-remesh GLB and cardinal preview thumbnails.
- Submission journal and raw API metadata are local scratch under `meshy-job.local/`; do not commit API scripts or credentials.

The generated source is one static composite rider/vehicle asset. A separate runtime derivative now has two independent wheel pivots and is integrated into the BXH BC renderer (see the runtime stage below). The rider remains in a fixed seated pose without a skeleton.

## Generation review

- V1 Multi-Image job succeeded technically and used 30 credits, but is **rejected for visual quality**: both wheels and much of the rider's lower body are missing/deformed. The same defect exists in the pre-remesh source. Checked all Meshy thumbnails and loaded the GLB on a light background in a task-owned Codex IAB tab. Files are preserved under `meshy/` for comparison; do not integrate this version.
- V1 final GLB: 10,208 triangles, one mesh/material, embedded texture 2048×2048, 3,272,400 bytes, no skin or animations. SHA-256: `44f482b8e5775263df9116cacbf3d12330bd4d2294e07a7409bd8fa454989128`.
- V2 corrective job: `01a13eac-f47e-72e8-8587-de2953907f4d`, Image to 3D smart-topology from `views/left.png`, target 10,000 triangles, texture 2K, no extra PBR maps. This tests a single clear profile after the multiview reconstruction failure; it does not replace the four requested source images.
- V2 succeeded, 15 credits. Total generation cost across V1 and V2: 45 credits. Downloaded result is `meshy-v2/model.glb`: 10,024 triangles, 3,196,820 bytes, one mesh/material and embedded texture, no skin or animation. SHA-256: `b7a5bfccadc529d2debdd437d3a4f1930bada6293cc62e064ee87fae8972da61`.
- V2 visual review: Meshy thumbnail plus four views in a local Three.js viewer on a light background in a task-owned IAB tab. Both wheels, both legs, helmet, motorcycle, delivery box and riding pose are present. The rear box face has no GHN logo, unlike the concept; the generation is not an exact four-view reconstruction. User art approval and actual BXH runtime validation are still pending. No automatic rig, independent wheel pivots or hub-type integration was applied.
- V2 preview: `meshy-v2/thumbnail.png`; structural report: `meshy-v2/inventory.json`. This inventory does not establish topology/manifold quality or animation suitability.

## Runtime stage — 2026-10-15

- Runtime derivative: `public/models/ghn-bc-rider-wheels-v1.glb` (repository root), 3,199,072 bytes. Raw V2 source hash above remains unchanged.
- Recreate using `node tools/prepare-ghn-rider.mjs`; verify using `node tools/verify-ghn-rider.mjs`. The preparation assigns whole connected components to the front/rear wheel and preserves all 10,024 source triangles, winding, UVs, normals and embedded texture bytes. Scale 2.2, rotate 180 degrees about Y to face +X and translate the lowest source point to ground Y=0.
- Three parts: `rider-body` 8,774 triangles, `rider-wheel-front` 725 triangles, `rider-wheel-rear` 525 triangles. Wheel radii approximately 0.313 scene units, spin axis Z. No new Meshy job was needed for integration.
- Explicit Hub types `BC` / `Bưu cục` use the rider; other/unknown types keep the existing truck. Common fleet positions, instance indexes, replay, rank changes, Best/Worst, selection and camera tracking stay shared. Rider parts, shadow silhouette, single head/tail lamp, narrow road beam/contact shadow and roof identity are calibrated separately.
- Imported derivative into headless Blender 5.2.1; inspected silhouette/matcap at four angles. Editable review copy and audit under `blender-review.local/`. This local review is not a rig/deformation test.
- Final source checks: 673/673 tests pass, build, scoped oxlint and diff check pass. The build retains its large 3D chunk warning.
- IAB QA uses actual `RoadScene3D` with 10/50 synthetic Hub records under `tools/bc-rider-preview.local/scene.html`. Verified HCM default, 7 BC/3 truck and 33 BC/17 truck, direct rider picking, follow, rank reordering, replay pause/resume, Best/Worst, day/night and reduced-motion wheel/distance freeze. No shader link or JavaScript errors; a Three.Clock deprecation warning was observed.
- Portrait 390×844 follow now aims nearer the vehicle, so the whole rider stays in frame; desktop look-ahead remains unchanged. Scene screenshots: `output/playwright/bc-rider/hcm-bc-fleet-final.png` and `hcm-bc-mobile-follow.png` (repository root).
- Verification is local with synthetic records, not authenticated production or real-device FPS. No commit, push or merge performed in this step.
