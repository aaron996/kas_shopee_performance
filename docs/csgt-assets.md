# CSGT assets and animation prototype

Source assets authored on 2026-10-29; packaged for repository release on 2026-11-03.

This package supplies a repaired touring motorcycle, a separately generated officer, a basic body rig and a 17-second roadside-check sequence. The asset-only delivery in PR #254 is now followed by [BXH idle integration](csgt-idle-integration.md): pursuit, random decorative stops, inspection and release. Rank and KPI data are unchanged.

- [Modular assets, provenance and validation](../output/imagegen/traffic-police-modular-v1/README.md)
- [Body rig and three pose clips](../output/imagegen/traffic-police-modular-v1/rig/README.md)
- [Complete motion prototype and limitations](../output/imagegen/traffic-police-modular-v1/animation/README.md)
- [Animation preview](../output/imagegen/traffic-police-modular-v1/animation/sequence-preview.gif)
- [Combined source model audit](../output/imagegen/traffic-police-v1/review/REPORT.md)

## Source assets

| File under `output/imagegen/traffic-police-modular-v1/` | Purpose |
| --- | --- |
| `motorcycle/csgt-motorcycle-prepared-v1.glb` | Rigid bike body and independent front/rear wheel pivots |
| `rig/csgt-officer-rigged-v1.glb` | Skinned officer with Stand/Ride/Inspect clips |
| `animation/csgt-check-sequence-v1.glb` | Officer plus paper prop, full sequence with root movement |

Editable Blender sources and selected review sheets are retained. Individual render frames, process logs, backup `.blend1` files and provider responses containing expiring links are omitted. Offline scripts regenerate the omitted render frames. Scripts require Blender 5.2.1 and the external `scenario-blender-expert` / `scenario-blender-rigging` skill helper modules under the current user's `~/.codex/skills`; those helpers are not vendored here. Scripts do not submit paid generation jobs.

Runtime copies live in `public/models/csgt-motorcycle-v1.glb` and `public/models/csgt-check-sequence-v1.glb`. The walk was extended to reach a GHN vehicle parked five scene units ahead. Offline Blender reports and runtime checks are described separately in the integration notes.

The body animation is stylized and still has open gloves, limited shoulder/hip deformation and approximate foot pivots. There is no driver-to-officer paper handoff or finger rig. Target-device performance and final art approval remain separate from local browser verification.
