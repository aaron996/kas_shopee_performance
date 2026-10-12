import { getVietnamBusinessDay } from './dashboardState.js';

const KEY_PREFIX = 'ghn_intro_seen_v1:';
const userKey = email => `${KEY_PREFIX}${email.trim().toLowerCase()}`;

// Keyed by user + Vietnam business day only (not build id): a fresh deploy
// must not force someone who already watched today's intro to wait again.
export function hasSeenIntroToday(storage, email, date = new Date()) {
  try {
    return storage.getItem(userKey(email)) === getVietnamBusinessDay(date);
  } catch {
    return false;
  }
}

export function markIntroSeen(storage, email, date = new Date()) {
  try { storage.setItem(userKey(email), getVietnamBusinessDay(date)); } catch { /* Skip rights are best-effort. */ }
}
