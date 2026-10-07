import { getVietnamBusinessDay } from './dashboardState.js';

const KEY_PREFIX = 'ghn_client_onboarding_v1:';
const userKey = email => `${KEY_PREFIX}${email.trim().toLowerCase()}`;

export function clientVisitToken(email, buildId, date = new Date()) {
  return JSON.stringify([email.trim().toLowerCase(), getVietnamBusinessDay(date), buildId]);
}

export function needsClientChoice(storage, email, buildId, date = new Date()) {
  try {
    return storage.getItem(userKey(email)) !== clientVisitToken(email, buildId, date);
  } catch {
    return true;
  }
}

export function saveClientChoice(storage, email, buildId, date = new Date()) {
  const token = clientVisitToken(email, buildId, date);
  try { storage.setItem(userKey(email), token); } catch { /* Keep this visit usable without storage. */ }
  return token;
}
