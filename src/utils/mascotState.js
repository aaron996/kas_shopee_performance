export function getMascotState({ isOpen, error, pending, status, focused, completed }) {
  if (!isOpen) return 'idle';
  if (error) return 'error';
  if (pending?.answer || status?.phase === 'answering') return 'result';
  if (status?.phase === 'querying_database') return 'searching';
  if (pending) return 'thinking';
  if (focused) return 'listening';
  if (completed) return 'result';
  return 'idle';
}
