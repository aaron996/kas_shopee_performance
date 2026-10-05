import test from 'node:test';
import assert from 'node:assert/strict';
import { getAppPermissions } from './appRoles.js';
import { canViewCodAdvanced, hasDevAdminRole } from '../../server/chat/auth.js';
import { getCodSmsEvidenceCacheKey } from './codSuspicionClient.js';

test('dev/admin/user permissions separate COD read access from dev panel authority', async () => {
  for (const role of ['dev', 'admin', 'user', 'root', undefined]) {
    const permissions = getAppPermissions(role);
    assert.equal(permissions.isDevAdmin, role === 'dev');
    assert.equal(permissions.canViewCodAdvanced, role === 'admin' || role === 'dev');
    const client = { rpc: async name => ({ data: name === 'is_dev_admin' ? role === 'dev' : ['dev', 'admin'].includes(role) }) };
    assert.equal(await hasDevAdminRole(client), role === 'dev');
    assert.equal(await canViewCodAdvanced(client), ['dev', 'admin'].includes(role));
  }
  assert.equal(await canViewCodAdvanced({ rpc: async () => ({ data: true, error: new Error('offline') }) }), false);
  assert.equal(await canViewCodAdvanced(null), false);
});

test('SMS evidence cache separates admin from user and dev scopes', () => {
  const base = { userEmail: 'person@ghn.vn', driverId: '1', orderCode: 'A', suspicionType: 'Gối đầu COD' };
  const keys = ['dev', 'admin', 'user'].map(role => getCodSmsEvidenceCacheKey({ ...base, role, isDevAdmin: role === 'dev' }));
  assert.equal(new Set(keys).size, 3);
});
