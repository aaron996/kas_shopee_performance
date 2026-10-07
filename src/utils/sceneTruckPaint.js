// Identity colours are independent of KPI, rank, filters and array order.
export function hubPaintColor(id) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) / 4294967296 * 360;
  return `hsl(${hue.toFixed(4)}, 68%, 53%)`;
}

// Preserve the model's logo band and roof decals; change cabin and plain panels.
// This mask is calibrated to /models/ghn-truck-wheels-v1.glb (3 units long).
const CABIN_X = 0.65, LOGO_BOTTOM = 0.69, LOGO_TOP = 1.19, ROOF_Y = 1.49;
export function truckPaintMask(x, y) {
  if (x > CABIN_X) return 1;
  return y >= LOGO_BOTTOM && y < LOGO_TOP || y >= ROOF_Y ? 0 : 1;
}

export function patchTruckPaint(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 instancePaint;\nvarying vec3 vInstancePaint;\nvarying vec2 vPaintPosition;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstancePaint = instancePaint;\nvPaintPosition = position.xy;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vInstancePaint;\nvarying vec2 vPaintPosition;')
    .replace('#include <map_fragment>', `#include <map_fragment>
      // Source paint is orange. Keep white, blue, glass and rubber unchanged.
      float orangePaint = smoothstep(0.12, 0.28, diffuseColor.r - max(diffuseColor.g, diffuseColor.b));
      float paintEnabled = step(0.0, vInstancePaint.r);
      // Evaluate the band per fragment: large panel triangles span the logo.
      float logoBand = step(${LOGO_BOTTOM}, vPaintPosition.y) * (1.0 - step(${LOGO_TOP}, vPaintPosition.y));
      float roofDecal = step(${ROOF_Y}, vPaintPosition.y);
      float paintMask = vPaintPosition.x > ${CABIN_X} ? 1.0 : 1.0 - max(logoBand, roofDecal);
      float paintShade = clamp(diffuseColor.r / 0.9, 0.18, 1.15);
      diffuseColor.rgb = mix(diffuseColor.rgb, vInstancePaint * paintShade, orangePaint * paintMask * paintEnabled);
    `);
}
