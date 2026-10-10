// Native orientation is best-effort; the view can still rotate with CSS.
export async function requestRankingLandscape(element, documentApi, orientation, isCurrent = () => true) {
  if (!orientation?.lock || !element?.requestFullscreen) return 'fallback';
  try {
    if (documentApi.fullscreenElement !== element) await element.requestFullscreen();
    if (!isCurrent()) {
      await releaseRankingLandscape(element, documentApi, orientation);
      return 'cancelled';
    }
    await orientation.lock('landscape');
    if (!isCurrent()) {
      await releaseRankingLandscape(element, documentApi, orientation);
      return 'cancelled';
    }
    return 'native';
  } catch {
    if (!isCurrent()) {
      await releaseRankingLandscape(element, documentApi, orientation);
      return 'cancelled';
    }
    // Fullscreen user-agent rules suppress CSS transforms. Leave it before
    // rotating the stage ourselves when the native orientation lock fails.
    await releaseRankingLandscape(element, documentApi, orientation);
    return 'fallback';
  }
}

export async function releaseRankingLandscape(element, documentApi, orientation) {
  try { orientation?.unlock?.(); } catch { /* unsupported or hidden document */ }
  if (documentApi.fullscreenElement === element) {
    try { await documentApi.exitFullscreen(); } catch { /* already exiting */ }
  }
}
