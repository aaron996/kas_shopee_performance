export function getMascotState({ isOpen, error, pending, focused }) {
  if (!isOpen) return 'idle';
  if (error) return 'error';
  if (pending?.answer) return 'speaking';
  if (pending) return 'thinking';
  if (focused) return 'listening';
  return 'idle';
}
