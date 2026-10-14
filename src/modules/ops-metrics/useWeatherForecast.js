import { useEffect, useState, useRef, useCallback } from 'react';
import { isWeatherFresh, WEATHER_FRESH_MS } from '../../utils/weather.js';
import { fetchWeatherForecast } from '../../utils/weatherClient.js';

export default function useWeatherForecast({ locations, regions, active, load = fetchWeatherForecast }) {
  const [state, setState] = useState({ key: '', forecasts: [], errors: [], loading: false, error: null });
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([regions.slice().sort(), locations.map(l => l.id).sort()]);
  const locationCount = locations.length;
  const latest = useRef(state); latest.current = state;
  const reload = useCallback(() => setRetry(n => n + 1), []);
  useEffect(() => {
    if (!active || !locationCount) return undefined;
    const controller = new AbortController();
    // Avoid requests caused by KPI metric/client changes with identical geography.
    const current = latest.current;
    if (!retry && current.key === key && current.forecasts.length && current.forecasts.every(f => isWeatherFresh(f))) return undefined;
    setState(previous => ({ key, forecasts: previous.key === key ? previous.forecasts : [], errors: [], loading: true, error: null }));
    const [selectedRegions, locationIds] = JSON.parse(key);
    load({ regions: selectedRegions, locationIds, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setState({ key, ...result, loading: false, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, forecasts: [], errors: [], loading: false, error });
    });
    return () => controller.abort();
  }, [active, key, retry, load, locationCount]); // key owns the complete geographic request.
  useEffect(() => {
    if (!active || !locationCount) return undefined;
    const refresh = () => { if (document.visibilityState === 'visible') reload(); };
    const interval = window.setInterval(refresh, WEATHER_FRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !latest.current.loading
        && latest.current.forecasts.some(f => !isWeatherFresh(f))) reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [active, key, reload, locationCount]);
  return { ...(state.key === key ? state : { forecasts: [], errors: [], loading: active && !!locations.length, error: null }), reload };
}
