// Material regions calibrated to the immutable, three-unit GHN GLB. Its
// albedo remains the source of brand colour; only light response changes.
export function patchTruckSurface(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTruckSurfacePosition;\nvarying vec3 vTruckSurfaceNormal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTruckSurfacePosition = position;\nvTruckSurfaceNormal = normal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTruckSurfacePosition;\nvarying vec3 vTruckSurfaceNormal;')
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      bool cab = vTruckSurfacePosition.x > 0.65;
      // The dark navy glass pixels on upright upper cab faces are distinct
      // from the blue bumper/chassis and from the cargo brand lettering.
      bool glass = cab && vTruckSurfacePosition.y > 0.72
        && abs(vTruckSurfaceNormal.y) < 0.65
        && diffuseColor.b > diffuseColor.r * 1.5
        && diffuseColor.g < 0.12 && diffuseColor.b > 0.018 && diffuseColor.b < 0.22;
      roughnessFactor = glass ? 0.18 : cab ? 0.43 : 0.78;
    `)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = glass ? 0.08 : vTruckSurfacePosition.y < 0.38 ? 0.28 : 0.04;
    `);
}

export function patchTruckWheelSurface(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      bool rim = dot(diffuseColor.rgb, vec3(0.3333)) > 0.32;
      roughnessFactor = rim ? 0.38 : 0.94;
    `)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = rim ? 0.5 : 0.0;
    `);
}

export const TRUCK_LIGHTS = {
  head: { x: 1.48, y: 0.54, z: 0.43 },
  tail: { x: -1.49, y: 0.43, z: 0.52 },
  beamLength: 4.8,
  beamWidth: 1.9
};
