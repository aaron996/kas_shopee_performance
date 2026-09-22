// This is deliberately framework-free: URL/session persistence and tests can
// depend on the module contract without pulling React or lazy chunks into Node.
export const MODULE_IDS = Object.freeze([
  'report1',
  'ranking',
  'report5',
  'report3',
  'report-insight',
  'cod-suspicion',
  'dev-admin'
]);

export function isModuleId(value) {
  return MODULE_IDS.includes(value);
}
