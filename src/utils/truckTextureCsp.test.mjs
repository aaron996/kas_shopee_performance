import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const main = config.headers.find(rule => rule.source === '/((?!auth/popup-callback).*)');
const policy = main.headers.find(header => header.key === 'Content-Security-Policy').value;
const directives = new Map(policy.split(';').map(part => part.trim().split(/\s+/)).filter(([key]) => key).map(([key, ...values]) => [key, values]));

test('production CSP permits embedded GLB textures through both browser image loaders', () => {
  // GLTFLoader creates a blob URL. ImageBitmapLoader fetches it (connect-src),
  // while the HTMLImageElement fallback loads it as an image (img-src).
  for (const directive of ['connect-src', 'img-src']) {
    assert.ok(directives.get(directive).includes('blob:'), `${directive} must permit embedded GLB images`);
    assert.ok(directives.get(directive).includes("'self'"));
    assert.ok(!directives.get(directive).includes('*'));
  }
  assert.deepEqual(directives.get('script-src'), ["'self'"]);
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
  assert.deepEqual(directives.get('frame-ancestors'), ["'self'", 'https://ka-control-tower.vercel.app']);
});
