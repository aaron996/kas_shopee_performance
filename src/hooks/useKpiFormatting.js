import { useCallback, useEffect, useState } from 'react';
import { readFormatting, saveFormatting, formattingStorageKey, visibleFormattingRules } from '../utils/kpiFormatting';

function readUserRules(userEmail) {
  try { return typeof window === 'undefined' ? {} : readFormatting(window.localStorage, userEmail); }
  catch { return {}; }
}

export default function useKpiFormatting(userEmail) {
  const key = formattingStorageKey(userEmail);
  const [draft, setDraft] = useState(null);
  const preview = useCallback((metricKey, value) => {
    setDraft(value ? { key, metricKey, value } : null);
  }, [key]);
  const [state, setState] = useState(() => ({ key, rules: readUserRules(userEmail) }));
  // Read synchronously on identity change so another account's colors never flash.
  let rules = state.rules;
  if (state.key !== key) {
    rules = readUserRules(userEmail);
    setState({ key, rules });
  }
  useEffect(() => {
    const sync = event => {
      if (event.key === key || event.key === null) setState({ key, rules: readUserRules(userEmail) });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key, userEmail]);
  const save = (metricKey, value) => {
    const next = saveFormatting(window.localStorage, userEmail, metricKey, value);
    setState({ key, rules: next });
  };
  const visibleRules = visibleFormattingRules(rules, draft?.key === key ? draft : null);
  return { rules: visibleRules, save, preview };
}
