import { REVERSE_CLIENT } from './clientLabels.js';
export { REVERSE_CLIENT };
// Match the dashboard's canonical Reverse code; it has no KPI target.
export const CHAT_CLIENT_LABELS = Object.freeze({
  SPB: 'SPB', SPE: 'SPE', [REVERSE_CLIENT]: 'SPE Reverse', ALL: 'Toàn bộ'
});
export const CHAT_CLIENT_CODES = Object.freeze(Object.keys(CHAT_CLIENT_LABELS));
export const CHAT_CLIENT_IDS = Object.freeze({ SPB: '3892833', SPE: '18692', [REVERSE_CLIENT]: '224845' });

export function normalizeChatClient(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const token = String(value).trim().toUpperCase();
  const code = CHAT_CLIENT_CODES.find(item => item.toUpperCase() === token);
  if (code) return code;
  if (['SHOPEE REVERSE', 'REVERSE', 'SPE_REVERSE', 'SPE-REVERSE'].includes(token)) return REVERSE_CLIENT;
  return Object.keys(CHAT_CLIENT_IDS).find(code => CHAT_CLIENT_IDS[code] === token) || null;
}
