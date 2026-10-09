export const STREETLIGHT_SPACING = 18;
export const MAX_STREETLIGHTS = 160;
export const STREETLIGHT_HEIGHT = 5.4;
export const MAX_STREETLIGHT_SOURCES = 4;

// Fixtures live on the far shoulder. Each pole, arm and emitter shares one anchor.
export function createStreetlightLayout(span, roadWidth) {
  const count = Math.min(MAX_STREETLIGHTS, Math.floor(span / STREETLIGHT_SPACING));
  const spacing = span / Math.max(1, count);
  const poleZ = -roadWidth / 2 - 0.85;
  return Array.from({ length: count }, (_, index) => {
    const anchor = -span / 2 + spacing * (index + 0.5);
    const part = (shape, x, y, z, scale, color, yaw = 0, roll = 0) => ({ shape, anchor, radius: 7, streetlight: true, x, y, z, scale, color, yaw, roll });
    return {
      id: `streetlight-${index}`, anchor,
      emitter: part('box', 0, STREETLIGHT_HEIGHT - 0.12, poleZ + 1.85, [0.66, 0.055, 0.3], 'white'),
      footprint: part('box', 0, 0.045, poleZ + 3.7, [15, 1, roadWidth * 1.35], 'white'),
      target: part('box', 0, 0.06, poleZ + 3.7, [1, 1, 1], 'white'),
      parts: [
        part('pole', 0, 0.12, poleZ, [0.36, 0.24, 0.36], 'stone'),
        part('pole', 0, 2.6, poleZ, [0.13, 5.2, 0.13], 'rail'),
        part('box', 0, 5.17, poleZ + 0.53, [1.16, 0.11, 0.11], 'rail', -Math.PI / 2, 0.38),
        part('box', 0, STREETLIGHT_HEIGHT, poleZ + 1.38, [1.28, 0.1, 0.13], 'rail', -Math.PI / 2),
        part('box', 0, STREETLIGHT_HEIGHT - 0.04, poleZ + 1.85, [0.82, 0.16, 0.44], 'door')
      ]
    };
  });
}

// Reuse a fixed shader light pool, selecting only sources near the viewed segment.
export function selectStreetlightSources(positions, focus, limit = MAX_STREETLIGHT_SOURCES) {
  const size = Math.max(0, Math.min(MAX_STREETLIGHT_SOURCES, Math.floor(limit) || 0));
  if (!size) return [];
  return positions.map((position, index) => ({ index, distance: (position.x - focus.x) ** 2 + (position.y - focus.y) ** 2 + (position.z - focus.z) ** 2 }))
    .filter(item => Number.isFinite(item.distance))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, size).map(item => item.index);
}
