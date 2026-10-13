export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// @ghn.vn is always allowed. Every other address must be on the Supabase
// allowlist (public.app_allowed_emails), which only the database can answer.
export function isGhnEmail(email) {
  return normalizeEmail(email).endsWith('@ghn.vn');
}

// Policy check shared by the sign-in form, the app session gate and the chat
// API. `client` is any Supabase client (anon, user or service). Fails closed:
// an RPC error never grants access.
export async function checkEmailAllowed(email, client) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return false;
  if (isGhnEmail(cleanEmail)) return true;
  if (!client || typeof client.rpc !== 'function') return false;
  try {
    const { data, error } = await client.rpc('is_email_allowed', { p_email: cleanEmail });
    return !error && data === true;
  } catch {
    return false;
  }
}
