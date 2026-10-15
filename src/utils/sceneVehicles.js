// Use the explicit operational type, never a substring in the Hub name.
export function sceneVehicleKind(item) {
  const type = String(item?.item?.hubType ?? item?.hubType ?? '').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toUpperCase();
  return type === 'BC' || type === 'BUU CUC' ? 'rider' : 'truck';
}

export const RIDER_ROOF = { maxX: -0.4, minY: 1.3, bandX: -0.5, codeZ: 0.30, codeWidth: 0.60, codeX: 0.94, codeLength: 0.36 };
export const RIDER_LIGHTS = { head: { x: 0.52, y: 1.05, z: 0 }, tail: { x: -1.02, y: 0.78, z: 0 }, beamLength: 4.5, beamWidth: 1.25 };
export function vehiclePickBounds(item) {
  return sceneVehicleKind(item) === 'rider' ? [1.12, 0.5, 1.8] : [1.55, 1, 1.7];
}
