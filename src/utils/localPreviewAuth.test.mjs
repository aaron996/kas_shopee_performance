import assert from 'node:assert/strict';
import test from 'node:test';
import { getLocalPreviewUser } from './localPreviewAuth.js';

test('local preview user is available only with the explicit development flag', () => {
  assert.deepEqual(
    getLocalPreviewUser({ DEV: true, VITE_LOCAL_BYPASS_AUTH: 'true', VITE_LOCAL_BYPASS_EMAIL: 'local-preview@ghn.vn' }),
    { email: 'local-preview@ghn.vn', name: 'local-preview', isDevAdmin: false, localPreview: true }
  );
  assert.equal(getLocalPreviewUser({ DEV: false, VITE_LOCAL_BYPASS_AUTH: 'true', VITE_LOCAL_BYPASS_EMAIL: 'local-preview@ghn.vn' }), null);
  assert.equal(getLocalPreviewUser({ DEV: true, VITE_LOCAL_BYPASS_AUTH: 'true', VITE_LOCAL_BYPASS_EMAIL: 'outside@example.com' }), null);
  assert.equal(getLocalPreviewUser({ DEV: true, VITE_LOCAL_BYPASS_AUTH: 'false', VITE_LOCAL_BYPASS_EMAIL: 'local-preview@ghn.vn' }), null);
});
