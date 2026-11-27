// LoopOnce pauses its action at the end. Re-enable before absolute sampling so
// replay, pause/resume and the next roadside stop use the same exported clip.
export function samplePoliceAnimation(mixer, action, elapsed) {
  if (!action) return;
  action.enabled = true;
  action.paused = false;
  mixer.setTime(Math.max(0, Math.min(action.getClip().duration, elapsed)));
}
