import { authenticateRequest } from '../chat/auth.js';
import { sendJson } from '../chat/sse.js';
import { MIEN_REGIONS } from '../../src/data/defaultDataset.js';
import { weatherLocationsInScope } from '../../src/data/weatherLocations.js';
import { readWeatherConfig, createForecastLoader, createRestWeatherCache, WeatherError } from './forecast.js';

const regions = new Set(Object.values(MIEN_REGIONS).flat());
const loadForecast = createForecastLoader();

export function createWeatherHandler(dependencies = {}) {
  const readConfig = dependencies.readConfig ?? readWeatherConfig;
  const authenticate = dependencies.authenticate ?? authenticateRequest;
  const load = dependencies.load ?? loadForecast;
  return async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: { code: 'WEATHER_METHOD', message: 'Chỉ hỗ trợ GET.' } }); return;
    }
    try {
      const config = readConfig();
      if (!config.supabaseUrl || !config.supabaseAnonKey || !config.supabaseServiceRoleKey) {
        throw new WeatherError('WEATHER_CONFIG_MISSING', 'Dự báo thời tiết chưa được cấu hình.');
      }
      await authenticate(req.headers?.authorization, config);
      const params = new URL(req.url, 'http://localhost').searchParams;
      if ([...params.keys()].some(key => !['regions', 'locations'].includes(key))) throw new WeatherError('WEATHER_REQUEST_INVALID', 'Bộ lọc dự báo không hợp lệ.', 400);
      const selected = [...new Set((params.get('regions') || '').split(',').filter(Boolean))];
      if (selected.some(region => !regions.has(region))) throw new WeatherError('WEATHER_REQUEST_INVALID', 'Vùng dự báo không hợp lệ.', 400);
      // The incumbent dashboard grants all report regions to its email allowlist;
      // it has no per-user region ACL. Do not invent one from user_metadata.
      const allowed = weatherLocationsInScope(selected);
      const requested = [...new Set((params.get('locations') || '').split(',').filter(Boolean))];
      if (requested.length > 3 || requested.some(id => !allowed.some(l => l.id === id))) throw new WeatherError('WEATHER_SCOPE', 'Điểm dự báo nằm ngoài phạm vi đang chọn.', 403);
      const locations = requested.length ? allowed.filter(l => requested.includes(l.id)) : allowed;
      if (!locations.length) { sendJson(res, 200, { forecasts: [], errors: [] }); return; }
      if (!config.enabled || !config.apiKey) throw new WeatherError('WEATHER_CONFIG_MISSING', 'Dự báo thời tiết chưa được cấu hình.');
      const cache = dependencies.cache ?? createRestWeatherCache(config);
      if (config.production && !cache) throw new WeatherError('WEATHER_CACHE_CONFIG', 'Dự báo thời tiết chưa được cấu hình.');
      const forecasts = [], errors = [];
      let firstError;
      for (const location of locations) {
        try { forecasts.push(await load(location, config, cache)); }
        catch (error) { firstError ||= error; errors.push({ locationId: location.id, message: error instanceof WeatherError ? error.message : 'Không tải được dự báo tại điểm này.' }); }
      }
      if (!forecasts.length) throw firstError instanceof WeatherError ? firstError : new WeatherError('WEATHER_UNAVAILABLE', 'Không tải được dự báo. Vui lòng thử lại sau.');
      sendJson(res, 200, { forecasts, errors });
    } catch (error) {
      const status = error instanceof WeatherError ? error.status : [401, 403].includes(error?.status) ? error.status : 503;
      sendJson(res, status, { error: { code: error instanceof WeatherError ? error.code : status === 401 ? 'WEATHER_UNAUTHORIZED' : 'WEATHER_UNAVAILABLE',
        message: error instanceof WeatherError ? error.message : status === 401 ? 'Đăng nhập lại để xem dự báo.' : 'Không tải được dự báo. Vui lòng thử lại sau.' } });
    }
  };
}
export default createWeatherHandler();
