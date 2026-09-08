const DEV_ADMIN_EMAIL = 'vinhlt@ghn.vn';

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isAllowedEmail(email) {
  const cleanEmail = normalizeEmail(email);
  return cleanEmail.endsWith('@ghn.vn') || cleanEmail === 'luongthevinh996@gmail.com';
}

export function isDevAdminEmail(email) {
  return normalizeEmail(email) === DEV_ADMIN_EMAIL;
}

