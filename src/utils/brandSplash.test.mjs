import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const splash = read('src/components/BrandSplash.jsx');
const css = read('src/components/BrandSplash.css');
const app = read('src/App.jsx');
const meta = JSON.parse(read('public/brand-intro.meta.json'));

test('brand video assets exist and loop window matches the player', () => {
  assert.ok(existsSync(resolve(process.cwd(), 'public/brand-intro.mp4')));
  assert.ok(existsSync(resolve(process.cwd(), 'public/brand-intro.webm')));
  assert.match(splash, new RegExp(`LOOP_START = ${meta.loopStart};`));
  assert.match(splash, new RegExp(`LOOP_END = ${meta.loopEnd};`));
});

test('BrandSplash is accessible, muted, and falls back to the static logo', () => {
  assert.match(splash, /role="status"/);
  assert.match(splash, /aria-busy="true"/);
  assert.match(splash, /\bmuted\b/);
  assert.match(splash, /playsInline/);
  assert.match(splash, /prefers-reduced-motion: reduce/);
  assert.match(splash, /ghn-performance-logo\.svg/);
  assert.doesNotMatch(splash, /<(p|h[1-6])\b/i, 'no headings or paragraphs; the only copy is the skip button');
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('App mounts BrandSplash from the first render and releases it only when the LIVE sync settles (not on cache restore)', () => {
  assert.match(app, /import BrandSplash from '\.\/components\/BrandSplash\.jsx'/);
  assert.match(app, /currentUser && <BrandSplash ready=\{activeTab === 'dev-admin' \|\| liveSyncSettled\} \/>/);
  assert.match(app, /setLiveSyncSettled\(true\)/);
  const cacheRestore = app.slice(app.indexOf('loadSyncSnapshot(currentUser.email)'), app.indexOf('autoRefreshBusinessDayRef = '));
  assert.doesNotMatch(cacheRestore, /setLiveSyncSettled/, 'a cache hit must not dismiss the intro');
});

test('splash has a skip button, a minimum display time, and a gentle reveal', () => {
  assert.match(splash, /className=\{`brand-splash__skip/);
  assert.match(splash, /Bỏ qua/);
  assert.match(splash, /onClick=\{\(\) => setPhase\('leaving'\)\}/);
  assert.match(splash, /MIN_SHOW_MS = \d+/);
  assert.match(css, /\.brand-splash__skip--visible/);
  assert.match(css, /min-height:\s*44px/, 'touch target');
});

test('splash is the first paint: no mount delay, white boot background until React mounts it', () => {
  const index = read('index.html');
  const main = read('src/main.jsx');
  assert.doesNotMatch(splash, /SHOW_DELAY_MS|'idle'/, 'a delay would let the app show through first');
  assert.match(splash, /useState\(ready \? 'gone' : 'show'\)/);
  assert.match(index, /html\.boot-white/);
  assert.match(index, /localStorage\.getItem\('ghn_user'\)/);
  assert.match(main, /classList\.remove\('boot-white'\)/);
});
