import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLoadingOverlayConfig } from './loadingOverlay.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('getLoadingOverlayConfig provides accessible attributes and no visible text', () => {
  const page = getLoadingOverlayConfig({ variant: 'page' });
  assert.equal(page.className, 'loading-skeleton loading-skeleton--page');
  assert.equal(page.role, 'status');
  assert.equal(page.ariaLive, 'polite');
  assert.equal(page.ariaBusy, 'true');
  assert.equal(page.ariaLabel, 'Đang tải dữ liệu');
  assert.equal(page.hasChart, true);
  assert.ok(page.kpiCount > 0);
  assert.equal(page.hasVisibleText, false, 'Skeleton must not have visible text');

  const block = getLoadingOverlayConfig();
  assert.equal(block.className, 'loading-skeleton loading-skeleton--block');
  assert.equal(block.hasChart, false);
  assert.equal(block.kpiCount, 0);
  assert.equal(block.hasVisibleText, false);
});

test('LoadingScreen.jsx renders only structural placeholders', () => {
  const jsx = read('src/components/LoadingScreen.jsx');
  assert.doesNotMatch(jsx, /<p\b/i, 'Must not render paragraph tags');
  assert.doesNotMatch(jsx, /<h[1-6]\b/i, 'Must not render heading tags');
  assert.doesNotMatch(jsx, /<button\b/i, 'Must not render button/CTA tags');
  assert.doesNotMatch(jsx, /\{text\}/, 'Must not output text to the DOM');
  assert.doesNotMatch(jsx, /sprite/i, 'The running-character sprite is gone');
  assert.match(jsx, /role=\{config\.role\}/);
  assert.match(jsx, /aria-label=\{config\.ariaLabel\}/);
});

test('LoadingScreen.css: anti-flicker delay, shimmer, reduced motion, no spinner/sprite', () => {
  const css = read('src/components/LoadingScreen.css');
  assert.match(css, /150ms/, 'must delay the first paint to avoid micro-flashes');
  assert.match(css, /@keyframes\s+loadingSkeletonSweep/);
  assert.match(css, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  assert.match(css, /\.loading-skeleton--page/);
  assert.match(css, /\.loading-skeleton--block/);
  assert.doesNotMatch(css, /playSprite|loading_sprite|rotate\(/);
});

test('legacy loading chrome is gone', () => {
  const app = read('src/App.jsx');
  const index = read('src/index.css');
  const motion = read('src/styles/operations-motion.css');
  assert.doesNotMatch(app, /sync-progress-bar|isSyncing/);
  assert.doesNotMatch(index, /sync-progress/);
  assert.doesNotMatch(motion, /\.is-loading \.animated-icon/);
});
