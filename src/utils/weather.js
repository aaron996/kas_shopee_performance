import { WEATHER_LOCATIONS, WEATHER_TIMEZONE } from '../data/weatherLocations.js';

export const WEATHER_PREFERENCE_KEY = 'ghn_weather_preference_v1';
export const WEATHER_FRESH_MS = 30 * 60 * 1000;
export const WEATHER_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function distanceKm(a, b) {
  const rad = degrees => degrees * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

// A nearest public point is a suggestion, not a determination of city/region
// membership or weather coverage. Ask the user to accept it before using it.
export function suggestWeatherPoint(position, locations = WEATHER_LOCATIONS, now = Date.now()) {
  const coords = position?.coords;
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)
    || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180
    || !Number.isFinite(coords.accuracy) || coords.accuracy < 0
    || !Number.isFinite(position.timestamp) || now - position.timestamp > 5 * 60 * 1000
    || position.timestamp > now + 60 * 1000) return { kind: 'unavailable' };
  const ranked = locations.map(location => ({ location, distanceKm: distanceKm(coords, location) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (!ranked.length) return { kind: 'unavailable' };
  // If uncertainty can swap the nearest points, prefer a manual selection.
  if (coords.accuracy > 5000 || (ranked[1] && ranked[1].distanceKm - ranked[0].distanceKm <= 2 * coords.accuracy / 1000)) return { kind: 'inaccurate' };
  // Conservative product proximity limits, not meteorological coverage claims.
  if (!Number.isFinite(ranked[0].location.suggestionRadiusKm)
    || ranked[0].distanceKm + coords.accuracy / 1000 > ranked[0].location.suggestionRadiusKm) return { kind: 'outside-pilot' };
  return { kind: 'suggested', locationId: ranked[0].location.id,
    distanceKm: ranked[0].distanceKm, accuracyKm: coords.accuracy / 1000 };
}

export function readWeatherPreference(storage, owner = null) {
  try {
    const value = JSON.parse(storage?.getItem(WEATHER_PREFERENCE_KEY) || 'null');
    if (owner != null && value?.owner !== owner) return { selectedId: null, source: 'manual', dismissed: false, pinnedIds: [] };
    return { selectedId: WEATHER_LOCATIONS.some(l => l.id === value?.selectedId) ? value.selectedId : null,
      source: value?.source === 'nearby' ? 'nearby' : 'manual', dismissed: value?.dismissed === true,
      pinnedIds: Array.isArray(value?.pinnedIds) ? [...new Set(value.pinnedIds.filter(id => WEATHER_LOCATIONS.some(l => l.id === id)))].slice(0, 3) : [] };
  } catch { return { selectedId: null, source: 'manual', dismissed: false, pinnedIds: [] }; }
}
export function writeWeatherPreference(storage, preference, owner = null) {
  try { storage?.setItem(WEATHER_PREFERENCE_KEY, JSON.stringify({ selectedId: preference.selectedId,
    source: preference.source === 'nearby' ? 'nearby' : 'manual', dismissed: preference.dismissed === true,
    pinnedIds: Array.isArray(preference.pinnedIds) ? preference.pinnedIds.slice(0, 3) : [], owner })); } catch { /* Storage can be unavailable. */ }
}
export function clearWeatherPreference(storage) {
  try { storage?.removeItem(WEATHER_PREFERENCE_KEY); } catch { /* Storage can be unavailable. */ }
}
export function isWeatherFresh(forecast, now = Date.now()) {
  const age = now - Date.parse(forecast?.fetchedAt);
  return Number.isFinite(age) && age >= -60000 && age < WEATHER_FRESH_MS && forecast?.stale !== true;
}
export function weatherHours(forecast, horizon = 12, now = Date.now()) {
  const age = now - Date.parse(forecast?.fetchedAt);
  // Allow one minute of clock skew and the small gap between mounting the panel
  // and receiving a newer forecast; neither should look like expired data.
  if (!Number.isFinite(age) || age < -60000 || age >= WEATHER_MAX_AGE_MS) return [];
  return (forecast?.hourly || []).filter(hour => Date.parse(hour.end) > now).slice(0, horizon);
}
export function weatherLabel(iso, options = {}) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: WEATHER_TIMEZONE, hour: '2-digit', minute: '2-digit', ...options }).format(new Date(iso));
}
export const weatherNumber = value => value == null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
