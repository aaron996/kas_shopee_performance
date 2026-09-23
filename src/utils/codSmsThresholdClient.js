import { supabase } from './supabaseClient.js';

async function requestThreshold(method, threshold) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn.');
  const response = await fetch('/api/cod-sms-threshold', {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
    },
    ...(method === 'POST' ? { body: JSON.stringify({ threshold }) } : {})
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'Không thể tải mốc điểm SMS.');
  return payload;
}

export const fetchCodSmsThreshold = () => requestThreshold('GET');
export const saveCodSmsThreshold = threshold => requestThreshold('POST', threshold);
