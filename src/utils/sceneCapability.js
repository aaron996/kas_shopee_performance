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
