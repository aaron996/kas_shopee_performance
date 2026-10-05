// Pure helpers for choosing between the 2D and 3D ranking scene.
// No React / three imports so `node --test` can run them.

export const SCENE_MODE_STORAGE_KEY = 'ghn.ranking.sceneMode';
export const MIN_CORES_FOR_DEFAULT_3D = 4; // default 3D only when cores > this

/**
 * @param {() => {getContext: Function} | null} createCanvas factory returning a canvas-like object
 * @returns {boolean}
 */
export function detectWebGL2(createCanvas) {
  try {
    const canvas = createCanvas();
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function isSceneMode(value) {
  return value === '2d' || value === '3d';
}

/**
 * Default scene mode (plan §2): 3D if WebGL2 and cores > 4, otherwise 2D.
 * A saved user choice wins, except 3D can never be forced without WebGL2.
 * `reducedMotion` does not change the mode: 3D is still shown, just without
 * auto-play/camera flights (handled by the 3D scene itself).
 */
export function pickDefaultSceneMode({ webgl2, cores, reducedMotion: _reducedMotion, saved } = {}) {
  if (!webgl2) return '2d';
  if (isSceneMode(saved)) return saved;
  return Number.isFinite(cores) && cores > MIN_CORES_FOR_DEFAULT_3D ? '3d' : '2d';
}
