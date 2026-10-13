import { useLayoutEffect } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export function useWorldAtlas() {
  const atlas = useLoader(THREE.TextureLoader, '/textures/world-surfaces-v1.png');
  const gl = useThree(state => state.gl);
  useLayoutEffect(() => {
    const anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    if (atlas.colorSpace === THREE.SRGBColorSpace && atlas.anisotropy === anisotropy) return;
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = anisotropy;
    atlas.needsUpdate = true;
  }, [atlas, gl]);
  return atlas;
}
export function atlasTile(id) {
  return id === 'rainforest' ? [1 / 3, 0.5] : id === 'alpine' ? [2 / 3, 0.5] : id === 'harbor' ? [0, 0] : [0, 0.5];
}
export function patchRoadAtlas(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    uniform vec2 surfaceFrom; uniform vec2 surfaceTo; uniform float surfaceBlend;
    uniform vec2 surfaceScale; uniform float surfaceTravel;`)
    .replace('#include <map_fragment>', `
      vec2 surfaceUv = vMapUv * surfaceScale + vec2(surfaceTravel, 0.0);
      vec2 tileUv = clamp(fract(surfaceUv), vec2(0.0078), vec2(0.9922)) * vec2(0.333333, 0.5);
      vec2 dx = dFdx(surfaceUv) * vec2(0.333333, 0.5), dy = dFdy(surfaceUv) * vec2(0.333333, 0.5);
      vec4 a = textureGrad(map, tileUv + surfaceFrom, dx, dy);
      vec4 b = textureGrad(map, tileUv + surfaceTo, dx, dy);
      vec4 surfaceSample = mix(a, b, surfaceBlend);
      diffuseColor *= surfaceSample;
    `)
    .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      // A restrained derivative bump uses the same shared albedo detail.
      float surfaceHeight = dot(surfaceSample.rgb, vec3(0.333333)) * 0.008;
      vec3 surfaceX = dFdx(-vViewPosition), surfaceY = dFdy(-vViewPosition);
      vec3 crossX = cross(surfaceY, normal), crossY = cross(normal, surfaceX);
      float surfaceDet = dot(surfaceX, crossX);
      vec3 surfaceGradient = sign(surfaceDet) * (dFdx(surfaceHeight) * crossX + dFdy(surfaceHeight) * crossY);
      normal = normalize(abs(surfaceDet) * normal - surfaceGradient);
    `);
}
