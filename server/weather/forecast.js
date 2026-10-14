import { WEATHER_MAPPING_VERSION, WEATHER_TIMEZONE } from '../../src/data/weatherLocations.js';
import { WEATHER_FRESH_MS, WEATHER_MAX_AGE_MS } from '../../src/utils/weather.js';

export class WeatherError extends Error {
  constructor(code, message, status = 503) { super(message); this.code = code; this.status = status; }
}
export function readWeatherConfig(env = process.env) {
  const production = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';
  return { enabled: env.WEATHER_ENABLED === 'true', production,
    apiKey: env.WEATHERAPI_KEY?.trim(),
    supabaseUrl: env.SUPABASE_URL?.trim(), supabaseAnonKey: env.SUPABASE_ANON_KEY?.trim(),
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    cacheUrl: env.WEATHER_CACHE_REST_URL?.trim(), cacheToken: env.WEATHER_CACHE_REST_TOKEN?.trim() };
}
const numeric = (value, min, max = Infinity) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;

export function normalizeForecast(raw, location, now = Date.now()) {
  const days = raw?.forecast?.forecastday;
  if (!Array.isArray(days) || !days.every(day => Array.isArray(day.hour))) {
    throw new WeatherError('WEATHER_RESPONSE_INVALID', 'Nguồn dự báo trả dữ liệu không hợp lệ.');
  }
  const rows = days.flatMap(day => day.hour);
  if (rows.some(row => !Number.isFinite(row?.time_epoch) || row.time_epoch <= 0)) throw new WeatherError('WEATHER_RESPONSE_INVALID', 'Nguồn dự báo trả dữ liệu không hợp lệ.');
  const seen = new Set();
  const hours = rows.sort((a, b) => a.time_epoch - b.time_epoch).filter(row => {
    if (seen.has(row.time_epoch)) return false; seen.add(row.time_epoch); return true;
  }).map(row => ({ start: new Date(row.time_epoch * 1000).toISOString(),
    end: new Date((row.time_epoch + 3600) * 1000).toISOString(), precipitationMm: numeric(row.precip_mm, 0),
    precipitationProbabilityPct: numeric(typeof row.chance_of_rain === 'string' && /^\d+$/.test(row.chance_of_rain) ? Number(row.chance_of_rain) : row.chance_of_rain, 0, 100),
    temperatureC: numeric(row.temp_c, -100, 100),
    weatherCode: numeric(row.condition?.code, 0, 9999), windKmh: numeric(row.wind_kph, 0) }))
    .filter(hour => Date.parse(hour.end) > now).slice(0, 24);
  if (!hours.length || !hours.some(h => h.precipitationMm != null || h.precipitationProbabilityPct != null)) {
    throw new WeatherError('WEATHER_RESPONSE_EMPTY', 'Chưa có dự báo mưa cho thời gian sắp tới.');
  }
  return { locationId: location.id, fetchedAt: new Date(now).toISOString(), forecastValidAt: hours[0].start,
    timezone: WEATHER_TIMEZONE, provider: 'WeatherAPI.com', stale: false, hourly: hours,
    current: { at: Number.isFinite(raw.current?.last_updated_epoch) ? new Date(raw.current.last_updated_epoch * 1000).toISOString() : null,
      temperatureC: numeric(raw.current?.temp_c, -100, 100) } };
}
export async function fetchProviderForecast(location, config, { fetchImpl = fetch, now = Date.now } = {}) {
  if (!config.apiKey) throw new WeatherError('WEATHER_CONFIG_MISSING', 'Dự báo thời tiết chưa được cấu hình.');
  const url = new URL('https://api.weatherapi.com/v1/forecast.json');
  Object.entries({ key: config.apiKey, q: `${location.latitude},${location.longitude}`, days: 2, aqi: 'no', alerts: 'no', lang: 'vi' })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    const raw = await response.json();
    if (!response.ok || raw.error) {
      if (raw.error?.code === 2007) throw new WeatherError('WEATHER_QUOTA', 'Nguồn dự báo đã hết lượt gọi trong tháng.');
      if ([1002, 2006, 2008, 2009].includes(raw.error?.code)) throw new WeatherError('WEATHER_CONFIG_MISSING', 'Dự báo thời tiết chưa được cấu hình.');
      throw new WeatherError('WEATHER_PROVIDER_FAILED', 'Không tải được dự báo. Vui lòng thử lại sau.');
    }
    return normalizeForecast(raw, location, now());
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    // Never echo provider URLs/errors, which may include a secret API key.
    throw new WeatherError('WEATHER_PROVIDER_FAILED', 'Không tải được dự báo. Vui lòng thử lại sau.');
  }
}

export function createRestWeatherCache(config, fetchImpl = fetch) {
  if (!config.cacheUrl || !config.cacheToken) return null;
  const url = new URL(config.cacheUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new WeatherError('WEATHER_CACHE_CONFIG', 'Cấu hình cache thời tiết không hợp lệ.');
  async function command(body) {
    const response = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${config.cacheToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new WeatherError('WEATHER_CACHE_UNAVAILABLE', 'Cache dự báo đang không sẵn sàng.');
    const result = await response.json();
    if (result.error) throw new WeatherError('WEATHER_CACHE_UNAVAILABLE', 'Cache dự báo đang không sẵn sàng.');
    return result.result;
  }
  return { async get(key) { const value = await command(['GET', key]); return value ? JSON.parse(value) : null; },
    set: (key, value) => command(['SET', key, JSON.stringify(value), 'EX', String(WEATHER_MAX_AGE_MS / 1000)]),
    lock: key => command(['SET', `${key}:lock`, '1', 'NX', 'EX', '12']) };
}

// One bounded entry per registry point; production additionally requires shared
// REST cache. Authorization is always done by the API before this function.
export function createForecastLoader({ fetchForecast = fetchProviderForecast, now = Date.now } = {}) {
  const memory = new Map(), inFlight = new Map();
  return async function load(location, config, sharedCache = null) {
    const key = `ghn:weather:${WEATHER_MAPPING_VERSION}:weatherapi:${location.id}:v1`;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      const cached = sharedCache ? await sharedCache.get(key) : memory.get(key);
      const age = now() - Date.parse(cached?.fetchedAt);
      const usable = cached?.locationId === location.id && Array.isArray(cached.hourly) && age >= 0 && age < WEATHER_MAX_AGE_MS
        && cached.hourly.some(h => Date.parse(h.end) > now());
      if (usable && age < WEATHER_FRESH_MS) return { ...cached, stale: false };
      if (sharedCache && !(await sharedCache.lock(key))) {
        if (usable) return { ...cached, stale: true };
        throw new WeatherError('WEATHER_BUSY', 'Dự báo đang được cập nhật. Vui lòng thử lại sau ít giây.');
      }
      try {
        const forecast = await fetchForecast(location, config, { now });
        if (sharedCache) await sharedCache.set(key, forecast);
        memory.set(key, forecast);
        return forecast;
      } catch (error) {
        if (usable) return { ...cached, stale: true };
        throw error;
      }
    })();
    inFlight.set(key, pending);
    try { return await pending; } finally { inFlight.delete(key); }
  };
}
