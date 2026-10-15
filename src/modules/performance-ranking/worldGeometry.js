import * as THREE from 'three';

// Reusable authored silhouettes. The mesa has terraces, the alpine peak has
// an asymmetric ridge, and broad leaves have a folded midrib (not cone trees).
export function worldGeometry(shape, backdrop = false) {
  if (shape === 'shopSign') return new THREE.PlaneGeometry(1, 1);
  if (shape === 'wheel') { const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); geometry.rotateX(Math.PI / 2); return geometry; }
  if (shape === 'awning') {
    const geometry = new THREE.BoxGeometry(1, 1, 1), p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - p.getZ(i) * 0.15);
    geometry.computeVertexNormals(); return geometry;
  }
  if (shape === 'cityRoof') {
    // A long hip ridge and lifted eave corners, shared by tiled city roofs.
    const a = [-0.5, 0.18, 0.5], b = [0, 0, 0.5], c = [0.5, 0.18, 0.5];
    const d = [0.5, 0, 0], e = [0.5, 0.18, -0.5], f = [0, 0, -0.5];
    const g = [-0.5, 0.18, -0.5], h = [-0.5, 0, 0], l = [-0.28, 1, 0], r = [0.28, 1, 0];
    const faces = [[a, b, l], [b, r, l], [b, c, r], [c, d, r], [d, e, r], [e, f, r], [f, l, r], [f, g, l], [g, h, l], [h, a, l]];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(2), 3));
    geometry.computeVertexNormals(); return geometry;
  }
  if (shape === 'arch') {
    const outline = new THREE.Shape();
    outline.moveTo(-0.5, 0); outline.lineTo(-0.5, 1); outline.lineTo(0.5, 1); outline.lineTo(0.5, 0);
    outline.lineTo(0.29, 0); outline.lineTo(0.29, 0.48);
    outline.quadraticCurveTo(0.29, 0.78, 0, 0.78); outline.quadraticCurveTo(-0.29, 0.78, -0.29, 0.48);
    outline.lineTo(-0.29, 0); outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false, curveSegments: 6 });
    geometry.translate(0, 0, -0.5); return geometry;
  }
  if (shape === 'bitexco') return new THREE.LatheGeometry([
    new THREE.Vector2(0.37, 0), new THREE.Vector2(0.48, 0.15), new THREE.Vector2(0.5, 0.6),
    new THREE.Vector2(0.4, 0.84), new THREE.Vector2(0.2, 1), new THREE.Vector2(0, 1)
  ], 16);
  if (shape === 'disc') { const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 20); geometry.rotateX(Math.PI / 2); return geometry; }
  if (shape === 'ring') return new THREE.TorusGeometry(0.42, 0.08, 5, 20);
  if (shape === 'mesa') {
    const geometry = new THREE.CylinderGeometry(0.62, 1, 1, 9, 8);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), angle = Math.atan2(p.getZ(i), p.getX(i));
      const terrace = 1 + Math.sin(Math.round((y + 0.5) * 8) * 2.1) * 0.04;
      const ridge = 1 + 0.15 * Math.sin(angle * 5 + 1.3);
      p.setXYZ(i, p.getX(i) * terrace * ridge, y + 0.5, p.getZ(i) * terrace * ridge);
    }
    geometry.computeVertexNormals(); return geometry;
  }
  if (shape === 'peak') {
    const geometry = new THREE.ConeGeometry(1, 1, 7, 5);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.5;
      p.setXYZ(i, p.getX(i) * (1 + 0.2 * Math.sin(p.getZ(i) * 8)), y, p.getZ(i) + y * 0.22);
    }
    geometry.computeVertexNormals(); return geometry;
  }
  if (shape === 'leaf') {
    const geometry = new THREE.SphereGeometry(1, 10, 6);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), p.getY(i) * 0.22 + Math.abs(p.getX(i)) * 0.12, p.getZ(i) * 0.42);
    geometry.computeVertexNormals(); return geometry;
  }
  if (shape === 'tumble') {
    const geometry = new THREE.TorusKnotGeometry(0.45, 0.026, 64, 3, 3, 7);
    geometry.rotateX(0.5); return geometry;
  }
  if (shape === 'water') { const geometry = new THREE.PlaneGeometry(1, 1, 8, 8); geometry.rotateX(-Math.PI / 2); return geometry; }
  if (shape === 'cone') return new THREE.ConeGeometry(1, 1, 9, 2);
  if (shape === 'round') return new THREE.IcosahedronGeometry(1, 1);
  if (shape === 'rock') {
    const geometry = new THREE.IcosahedronGeometry(1, 1), p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const radius = 1 + Math.sin(x * 5 + y * 7 + z * 3) * 0.13;
      p.setXYZ(i, x * radius, y * radius, z * radius);
    }
    geometry.computeVertexNormals(); return geometry;
  }
  if (shape === 'hill') return new THREE.SphereGeometry(1, backdrop ? 16 : 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  if (shape === 'pole') return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
  if (shape === 'sign') return new THREE.PlaneGeometry(1, 1);
  return new THREE.BoxGeometry(1, 1, 1);
}

export function patchWorldMaterial(shader, visibility, shape, atlas) {
  shader.uniforms.worldVisibility = visibility;
  shader.uniforms.surfaceAtlas = { value: atlas };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float instanceSurface; varying float vSurface; varying vec3 vWorldGrain; varying vec3 vWorldLocal;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vWorldLocal = position;
      vSurface = instanceSurface;
      vWorldGrain = (instanceMatrix * vec4(position, 1.0)).xyz;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    uniform float worldVisibility; uniform sampler2D surfaceAtlas; varying float vSurface; varying vec3 vWorldGrain; varying vec3 vWorldLocal;
    float grain(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.a *= worldVisibility;
      ${['sign', 'shopSign', 'shopGlass', 'glass', 'bitexco'].includes(shape) ? '' : `
      float speckle = grain(floor(vWorldGrain * 22.0));
      float strata = sin(vWorldGrain.y * ${shape === 'mesa' ? '4.5' : '24.0'} + sin(vWorldGrain.x * 0.6) * 0.6);
      diffuseColor.rgb *= 0.92 + speckle * 0.1 + strata * ${shape === 'mesa' ? '0.10' : shape === 'pole' ? '0.06' : '0.025'};
      if (vSurface > 0.5) {
        vec2 tile = vSurface < 1.5 ? vec2(0.666667, 0.0) : vSurface < 2.5 ? vec2(0.0, 0.5) : vec2(0.0, 0.0);
        vec2 uv = vWorldGrain.xy * ${shape === 'mesa' || shape === 'peak' ? '0.15' : '0.65'};
        vec2 dx = dFdx(uv) * vec2(0.333333, 0.5), dy = dFdy(uv) * vec2(0.333333, 0.5);
        vec3 grainColor = textureGrad(surfaceAtlas, clamp(fract(uv), vec2(0.0078), vec2(0.9922)) * vec2(0.333333, 0.5) + tile, dx, dy).rgb;
        float detail = dot(grainColor, vec3(0.333333));
        diffuseColor.rgb *= 0.72 + detail * 0.7;
      }
      ${shape === 'peak' ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.89, 0.9), smoothstep(0.57, 0.73, vWorldLocal.y + sin(vWorldLocal.x * 18.0) * 0.035));' : ''}
      ${shape === 'water' ? 'diffuseColor.rgb *= 0.88 + 0.12 * sin(vWorldGrain.x * 3.0 + vWorldGrain.z * 4.0);' : ''}`}`);
  if (shape === 'glass' || shape === 'bitexco') shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    float floorLine = step(0.91, fract(vWorldLocal.y * 24.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.65, 0.78, 0.79), floorLine * 0.45);`);
  if (shape === 'awning') shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    float stripeUv = vWorldLocal.x * 12.0;
    float canvasStripe = smoothstep(0.5 - fwidth(stripeUv), 0.5 + fwidth(stripeUv), abs(fract(stripeUv) - 0.5) * 2.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.82, 0.67), canvasStripe * 0.8);`);
  if (shape === 'shopSign') shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float instanceShop;')
    .replace('#include <uv_vertex>', `#include <uv_vertex>
      vMapUv = clamp(vMapUv, vec2(0.01), vec2(0.99)) * 0.25 + vec2(mod(instanceShop, 4.0), 3.0 - floor(instanceShop / 4.0)) * 0.25;
      vEmissiveMapUv = vMapUv;`);
}
