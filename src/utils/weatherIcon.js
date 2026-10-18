// WeatherAPI condition codes: https://www.weatherapi.com/docs/weather_conditions.json
// The artwork does not cover snow/ice/dust: leave those unknown rather than
// turning them into a misleading rain/sun illustration.
export function resolveWeatherIcon(hour) {
  if (!hour || !Number.isFinite(hour.weatherCode)) return null;
  const code = hour.weatherCode;
  if ([1087, 1273, 1276].includes(code)) return 'storm';
  if ([1192, 1195, 1243, 1246].includes(code)) return 'heavy-rain';
  if ([1063, 1150, 1153, 1180, 1183, 1186, 1189, 1240].includes(code)) return 'rain';
  if ([1030, 1135, 1147].includes(code)) return 'fog';
  if ([1006, 1009].includes(code)) return 'cloudy';
  if (code !== 1000 && code !== 1003) return null;
  // The DTO has no provider is_day flag. Use an explicit Vietnam clock
  // convention (06:00–17:59), not an implied astronomical sunrise calculation.
  const time = Date.parse(hour.start);
  if (!Number.isFinite(time)) return null;
  const vietnamHour = new Date(time + 7 * 60 * 60 * 1000).getUTCHours();
  const night = vietnamHour < 6 || vietnamHour >= 18;
  return code === 1000 ? (night ? 'night' : 'sunny') : (night ? 'cloudy-night' : 'partly-cloudy');
}
