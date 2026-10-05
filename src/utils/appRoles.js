export function getAppRole(role) {
  return ['dev', 'admin', 'user'].includes(role) ? role : 'user';
}

export function getAppPermissions(role) {
  const appRole = getAppRole(role);
  return { role: appRole, isDevAdmin: appRole === 'dev', canViewCodAdvanced: appRole === 'dev' || appRole === 'admin' };
}
