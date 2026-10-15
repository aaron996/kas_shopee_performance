import * as THREE from 'three';
import { CITY_SHOP_SIGNS } from '../../utils/sceneCityStreet.js';

export function createCityShopTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < CITY_SHOP_SIGNS.length; i++) {
    const [name, subtitle, background, foreground] = CITY_SHOP_SIGNS[i];
    const x = i % 4 * 512, y = Math.floor(i / 4) * 128;
    ctx.fillStyle = background; ctx.fillRect(x, y, 512, 128);
    ctx.strokeStyle = foreground; ctx.lineWidth = 2; ctx.strokeRect(x + 9, y + 9, 494, 110);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = foreground;
    ctx.font = `700 ${name.length > 14 ? 42 : 51}px Arial`;
    ctx.fillText(name, x + 256, y + 52, 474);
    ctx.font = '500 20px Arial'; ctx.fillText(subtitle, x + 256, y + 96, 470);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
