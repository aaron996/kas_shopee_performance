// Public forecast points, never coordinates of a person or a Hub.
// GeoNames coordinates checked 2026-10-14. Region association is intentionally
// limited to the unambiguous HCM/HNO city scopes already present in the app.
export const WEATHER_MAPPING_VERSION = '2026-10-14-pilot';
export const WEATHER_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const WEATHER_LOCATIONS = Object.freeze([
  Object.freeze({ id: 'hcm-city', name: 'TP.HCM', latitude: 10.82302, longitude: 106.62965,
    regions: Object.freeze(['HCM', 'HCM - KA', 'HCM - CK']), granularity: 'city-point', suggestionRadiusKm: 25,
    source: 'https://www.geonames.org/1566083/ho-chi-minh-city.html', verifiedAt: '2026-10-14' }),
  Object.freeze({ id: 'hanoi-city', name: 'Hà Nội', latitude: 21.02450, longitude: 105.84117,
    regions: Object.freeze(['HNO', 'HNO - KA', 'HNO - CK']), granularity: 'city-point', suggestionRadiusKm: 20,
    source: 'https://www.geonames.org/1581130/hanoi.html', verifiedAt: '2026-10-14' })
]);

export function weatherLocationsInScope(regions, allowedLocations = WEATHER_LOCATIONS) {
  if (!Array.isArray(regions) || !regions.length) return [];
  return allowedLocations.filter(location => location.regions.some(region => regions.includes(region)));
}

export function unmappedWeatherRegions(regions) {
  return (regions || []).filter(region => !WEATHER_LOCATIONS.some(l => l.regions.includes(region)));
}
