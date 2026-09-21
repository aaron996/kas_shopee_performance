export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isAllowedEmail(email) {
  const cleanEmail = normalizeEmail(email);
  return cleanEmail.endsWith('@ghn.vn') || cleanEmail === 'luongthevinh996@gmail.com';
}

