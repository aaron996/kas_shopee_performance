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
  assert.doesNotMatch(splash, /<(p|h[1-6]|button|span)\b/i, 'no visible copy');
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('App mounts BrandSplash only for a signed-in user and releases it on first sync', () => {
  assert.match(app, /import BrandSplash from '\.\/components\/BrandSplash\.jsx'/);
  assert.match(app, /currentUser && <BrandSplash ready=\{activeTab === 'dev-admin' \|\| hasCompletedInitialSync\} \/>/);
});
