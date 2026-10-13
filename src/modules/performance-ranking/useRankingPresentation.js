import { useCallback, useEffect, useRef, useState } from 'react';
import { releaseRankingLandscape, requestRankingLandscape } from '../../utils/rankingPresentation.js';

export default function useRankingPresentation(stageRef, sceneToggleRef) {
  const [sceneOnly, setSceneOnly] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [rotating, setRotating] = useState(false);
  const requestVersion = useRef(0);
  const nativeActive = useRef(false);
  const previousSceneOnly = useRef(false);
  const immersive = sceneOnly || landscape;
  const cancelRequest = useCallback(() => { requestVersion.current += 1; }, []);

  const toggleSceneOnly = useCallback(() => {
    setSceneOnly(value => !value);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ranking-presentation-change', { detail: { hidden: sceneOnly || landscape } }));
    return () => window.dispatchEvent(new CustomEvent('ranking-presentation-change', { detail: { hidden: false } }));
  }, [sceneOnly, landscape]);

  const toggleLandscape = useCallback(async () => {
    if (rotating) return;
    const version = ++requestVersion.current;
    const element = stageRef.current;
    if (landscape) {
      nativeActive.current = false;
      setLandscape(false);
      await releaseRankingLandscape(element, document, window.screen.orientation);
      return;
    }
    setLandscape(true);
    setRotating(true);
    const result = await requestRankingLandscape(element, document, window.screen.orientation, () => requestVersion.current === version);
    if (requestVersion.current === version) {
      nativeActive.current = result === 'native';
      setRotating(false);
    }
  }, [landscape, rotating, stageRef]);

  useEffect(() => {
    const element = stageRef.current;
    let ownedFullscreen = false;
    const onFullscreenChange = () => {
      if (document.fullscreenElement === element) ownedFullscreen = true;
      else if (ownedFullscreen) {
        ownedFullscreen = false;
        if (nativeActive.current) {
          nativeActive.current = false;
          cancelRequest();
          setLandscape(false);
          setRotating(false);
          void releaseRankingLandscape(element, document, window.screen.orientation);
        }
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      cancelRequest();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      // Only release the orientation/fullscreen owned by this stage.
      if (document.fullscreenElement === element) void releaseRankingLandscape(element, document, window.screen.orientation);
    };
  }, [stageRef, cancelRequest]);

  useEffect(() => {
    if (!immersive) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [immersive]);

  useEffect(() => {
    if (previousSceneOnly.current === sceneOnly) return;
    previousSceneOnly.current = sceneOnly;
    // The persistent toggle stays available outside the hidden/inert HUD.
    sceneToggleRef.current?.focus({ preventScroll: true });
  }, [sceneOnly, stageRef, sceneToggleRef]);

  return { sceneOnly, setSceneOnly, landscape, rotating, immersive, toggleSceneOnly, toggleLandscape };
}
