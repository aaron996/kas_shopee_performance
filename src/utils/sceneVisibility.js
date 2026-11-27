import { sampleRoadFrame } from './sceneRoadCurve.js';

// Conservative padded sphere: an actor may be recycled only beyond the view,
// never merely because its centre crossed a simulation boundary.
export function trafficInView(state, x, z) {
  const view = state.cameraView;
  if (!view) return false;
  const f = sampleRoadFrame(x, z, view.roadLength);
  return view.planes.every(p => p[0]*f.x+p[1]*(f.y+1)+p[2]*f.z+p[3] >= -5);
}

export function labelAnchorInView(x, y, z) {
  return z >= -1 && z <= 1 && Math.abs(x) < .96 && Math.abs(y) < .96;
}
