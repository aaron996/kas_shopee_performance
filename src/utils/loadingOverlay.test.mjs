import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLoadingOverlayConfig } from './loadingOverlay.js';

test('getLoadingOverlayConfig provides accessible attributes and no visible text', () => {
  const fullscreenConfig = getLoadingOverlayConfig({
    fullScreen: true,
    option: 4,
    text: 'Đang tải dữ liệu...'
  });

  assert.equal(fullscreenConfig.overlayClass, 'loading-overlay loading-overlay--fullscreen');
  assert.equal(fullscreenConfig.role, 'status');
  assert.equal(fullscreenConfig.ariaLive, 'polite');
  assert.equal(fullscreenConfig.ariaBusy, 'true');
  assert.equal(fullscreenConfig.ariaLabel, 'Đang tải dữ liệu');
  assert.equal(fullscreenConfig.spriteClass, 'loading-sprite sprite-option-4');
  assert.equal(fullscreenConfig.spriteAriaHidden, 'true');
  assert.equal(fullscreenConfig.hasVisibleText, false, 'Overlay must not have visible text');

  const containedConfig = getLoadingOverlayConfig({
    fullScreen: false
  });
  assert.equal(containedConfig.overlayClass, 'loading-overlay loading-overlay--contained');
  assert.equal(containedConfig.hasVisibleText, false);
});

test('LoadingScreen.jsx source strictly excludes any text nodes or paragraphs', () => {
  const jsxPath = resolve(process.cwd(), 'src/components/LoadingScreen.jsx');
  const jsxContent = readFileSync(jsxPath, 'utf8');

  // Verify no text elements in JSX template
  assert.doesNotMatch(jsxContent, /<p\b/i, 'Must not render paragraph tags');
  assert.doesNotMatch(jsxContent, /<h[1-6]\b/i, 'Must not render heading tags');
  assert.doesNotMatch(jsxContent, /<button\b/i, 'Must not render button/CTA tags');
  assert.doesNotMatch(jsxContent, /loading-text/, 'Must not contain loading-text class');
  assert.doesNotMatch(jsxContent, /\{text\}/, 'Must not output {text} prop to DOM');

  // Verify presence of sprite element and accessibility
  assert.match(jsxContent, /spriteClass/, 'Must render character sprite');
  assert.match(jsxContent, /role=\{config\.role\}/, 'Must assign role="status"');
  assert.match(jsxContent, /aria-label=\{config\.ariaLabel\}/, 'Must assign aria-label');
});

test('LoadingScreen.css enforces anti-flicker delay, reduced-motion, and contained variants', () => {
  const cssPath = resolve(process.cwd(), 'src/components/LoadingScreen.css');
  const cssContent = readFileSync(cssPath, 'utf8');

  // Anti-flicker delay: 150ms before becoming visible
  assert.match(cssContent, /150ms/, 'CSS must include delay threshold to prevent micro-flashes on fast loads');
  assert.match(cssContent, /@keyframes\s+loadingOverlayFadeIn/, 'CSS must define fade-in animation');

  // Reduced motion: halts sprite animation and displays static initial frame
  assert.match(cssContent, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/, 'CSS must handle prefers-reduced-motion');
  assert.match(cssContent, /background-position:\s*0%\s*0%/, 'Reduced motion must show static first frame');

  // Contained variant styling
  assert.match(cssContent, /\.loading-overlay--contained/, 'CSS must define contained overlay variant');

  // No text classes in CSS
  assert.doesNotMatch(cssContent, /\.loading-text\b/, 'CSS must not define .loading-text styles');
});
