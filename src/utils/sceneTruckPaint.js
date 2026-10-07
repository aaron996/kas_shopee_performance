// Identity is independent of KPI, rank, filters and array order.
function hubHash(id) {
  let hash = 2166136261;
  for (const character of String(id)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export function hubPaintColor(id) {
  return `hsl(${(hubHash(id) / 4294967296 * 360).toFixed(4)}, 68%, 53%)`;
}
// Visual identifier, not the business Hub code or current rank.
export function hubRoofCode(id) {
  return hubHash(id).toString(16).toUpperCase().padStart(8, '0').slice(-4);
}
// Calibrated to the current 3-unit GLB, cab towards +X.
export const TRUCK_ROOF = { minX: -1.5, maxX: 0.65, minY: 1.49, bandX: 0.263 };
export function truckPaintMask(x, y, normalY = 1) {
  return x <= TRUCK_ROOF.maxX && y >= TRUCK_ROOF.minY && normalY > 0.5 && x >= TRUCK_ROOF.bandX ? 1 : 0;
}
export function patchTruckPaint(shader, glyphTexture) {
  shader.uniforms.roofGlyphs = { value: glyphTexture };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute vec3 instancePaint;
      attribute vec4 instanceRoofCode;
      varying vec3 vInstancePaint;
      varying vec4 vRoofCode;
      varying vec3 vPaintPosition;
      varying float vRoofNormal;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vInstancePaint = instancePaint;
      vRoofCode = instanceRoofCode;
      vPaintPosition = position;
      vRoofNormal = normal.y;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform sampler2D roofGlyphs;
      varying vec3 vInstancePaint;
      varying vec4 vRoofCode;
      varying vec3 vPaintPosition;
      varying float vRoofNormal;`)
    .replace('#include <map_fragment>', `#include <map_fragment>
      // Replace only upward cargo roof, including its upside-down source decal.
      if (vPaintPosition.x <= ${TRUCK_ROOF.maxX} && vPaintPosition.y >= ${TRUCK_ROOF.minY} && vRoofNormal > 0.5) {
        vec3 roofColor = vec3(0.91, 0.90, 0.86);
        if (vPaintPosition.x >= ${TRUCK_ROOF.bandX}) {
          roofColor = vInstancePaint.r >= 0.0 ? vInstancePaint : vec3(0.88, 0.19, 0.025);
        }
        // Text reads across the truck, top towards the cab.
        vec2 codeUV = vec2((vPaintPosition.z + 0.44) / 0.88, (vPaintPosition.x + 0.84) / 0.48);
        if (codeUV.x >= 0.0 && codeUV.x < 1.0 && codeUV.y >= 0.0 && codeUV.y <= 1.0) {
          float cell = floor(codeUV.x * 4.0);
          float glyph = cell < 1.0 ? vRoofCode.x : cell < 2.0 ? vRoofCode.y : cell < 3.0 ? vRoofCode.z : vRoofCode.w;
          float ink = texture2D(roofGlyphs, vec2((glyph + fract(codeUV.x * 4.0)) / 16.0, codeUV.y)).a;
          roofColor = mix(roofColor, vec3(0.018, 0.028, 0.045), ink);
        }
        diffuseColor.rgb = roofColor;
      }
    `);
}
