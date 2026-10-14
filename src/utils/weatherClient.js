import { supabase } from './supabaseClient.js';

export async function fetchWeatherForecast({ regions, locationIds, signal }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw Object.assign(new Error('Đăng nhập lại để xem dự báo.'), { code: 'WEATHER_UNAUTHORIZED' });
  const params = new URLSearchParams({ regions: regions.join(','), locations: locationIds.join(',') });
  const response = await fetch(`/api/weather?${params}`, { signal,
    headers: { Authorization: `Bearer ${session.access_token}` } });
  let result;
  try { result = await response.json(); } catch { throw new Error('Không tải được dự báo. Vui lòng thử lại.'); }
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Không tải được dự báo.'), { code: result.error?.code });
  if (!Array.isArray(result.forecasts) || !Array.isArray(result.errors)) throw new Error('Nguồn dự báo trả dữ liệu không hợp lệ.');
  return result;
}

// The browser's coordinates are consumed by the caller to compute a suggestion
// and discarded; neither this function nor the forecast API transmits them.
export function requestWeatherPosition(browserNavigator = navigator) {
  return new Promise((resolve, reject) => {
    if (!browserNavigator?.geolocation) { reject(Object.assign(new Error('Thiết bị chưa hỗ trợ định vị.'), { code: 'unsupported' })); return; }
    browserNavigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  });
}

// Querying permission does not show a prompt or read coordinates. Some browsers
// do not expose this API; the explicit geolocation call remains the fallback.
export function observeWeatherPermission(onDenied, browserNavigator = navigator) {
  let disposed = false, status;
  const change = () => { if (!disposed && status?.state === 'denied') onDenied(); };
  if (browserNavigator?.permissions?.query) {
    Promise.resolve().then(() => browserNavigator.permissions.query({ name: 'geolocation' })).then(result => {
      if (disposed) return;
      status = result; status.addEventListener?.('change', change); change();
    }).catch(() => { /* Permission querying is optional. */ });
  }
  return () => { disposed = true; status?.removeEventListener?.('change', change); };
}
