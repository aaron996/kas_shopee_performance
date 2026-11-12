import { useCallback, useEffect, useState } from 'react';
import { backlogStorageKey, readBacklogFormatting, saveBacklogFormatting } from '../utils/backlogFormatting';

function readRule(userEmail) {
  try { return typeof window === 'undefined' ? null : readBacklogFormatting(window.localStorage, userEmail); }
  catch { return null; }
}

// Cài đặt tô màu tab Backlog theo từng tài khoản; bản nháp (preview) hiện ngay trên bảng khi đang chỉnh.
export default function useBacklogFormatting(userEmail) {
  const key = backlogStorageKey(userEmail);
  const [state, setState] = useState(() => ({ key, rule: readRule(userEmail) }));
  const [draft, setDraft] = useState(null);
  let rule = state.rule;
  if (state.key !== key) { rule = readRule(userEmail); setState({ key, rule }); }
  useEffect(() => {
    const sync = event => { if (event.key === key || event.key === null) setState({ key, rule: readRule(userEmail) }); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key, userEmail]);
  const preview = useCallback(value => setDraft(value ? { key, value } : null), [key]);
  const save = value => setState({ key, rule: saveBacklogFormatting(window.localStorage, userEmail, value) });
  const active = draft?.key === key ? draft.value : rule;
  return { rule: active && active.mode !== 'app' ? active : null, saved: rule, save, preview };
}
