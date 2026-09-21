import { isAllowedEmail, normalizeEmail } from './authPolicy.js';

// This is deliberately a UI-only local preview switch. It never creates a
// Supabase session, token, or elevated role, and Vite removes it from a
// production build because import.meta.env.DEV is false there.
export function getLocalPreviewUser(env = import.meta.env) {
  if (!env?.DEV || env.VITE_LOCAL_BYPASS_AUTH !== 'true') return null;

  const email = normalizeEmail(env.VITE_LOCAL_BYPASS_EMAIL);
  if (!isAllowedEmail(email)) return null;

  return {
    email,
    name: email.split('@')[0],
    isDevAdmin: false,
    localPreview: true
  };
}
