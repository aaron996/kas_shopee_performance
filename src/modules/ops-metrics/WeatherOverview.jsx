import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { MapPin, LocateFixed, Pin, PinOff, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import WeatherPaperIcon from './WeatherPaperIcon';
import { weatherLocationsInScope, unmappedWeatherRegions, WEATHER_LOCATIONS } from '../../data/weatherLocations.js';
import { readWeatherPreference, writeWeatherPreference, suggestWeatherPoint, weatherHours, weatherLabel, weatherNumber } from '../../utils/weather.js';
import { requestWeatherPosition, observeWeatherPermission } from '../../utils/weatherClient.js';
import useWeatherForecast from './useWeatherForecast.js';
import './weather.css';

const locationError = error => error?.code === 1 ? 'Chưa được cấp quyền vị trí. Bạn có thể chọn địa điểm hoặc bật quyền trong cài đặt trình duyệt.'
  : error?.code === 'unsupported' ? 'Thiết bị chưa hỗ trợ định vị. Hãy chọn địa điểm.'
    : 'Chưa lấy được vị trí. Thử lại hoặc chọn địa điểm.';

export default function WeatherOverview({ selectedRegions = [], active = false, localPreview = false, userKey = 'preview', loadForecast, locate = requestWeatherPosition, observePermission = observeWeatherPermission }) {
  const locations = useMemo(() => weatherLocationsInScope(selectedRegions), [selectedRegions]);
  const missing = unmappedWeatherRegions(selectedRegions);
  const [preference, setPreference] = useState(() => readWeatherPreference(sessionStorage, userKey));
  const [geo, setGeo] = useState({ kind: 'idle' });
  const geoGeneration = useRef(0);
  const [horizon, setHorizon] = useState(12);
  const [page, setPage] = useState(0);
  const [selectedHour, setSelectedHour] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const pinnedIds = preference.pinnedIds;
  const [clock, setClock] = useState(Date.now);
  const request = useWeatherForecast({ locations, regions: selectedRegions, active, load: loadForecast });
  const selectedId = locations.some(l => l.id === preference.selectedId) ? preference.selectedId : locations[0]?.id;
  const location = locations.find(l => l.id === selectedId);
  const forecast = request.forecasts.find(f => f.locationId === selectedId);
  const hours = weatherHours(forecast, horizon, clock);
  const safePage = Math.min(page, Math.max(0, Math.ceil(hours.length / 4) - 1));
  const hour = hours.find(h => h.start === selectedHour) || hours[safePage * 4] || hours[0];
  const peak = hours.reduce((best, h) => h.precipitationMm != null && (!best || h.precipitationMm > best.precipitationMm) ? h : best, null);
  const hasForecast = hours.length > 0;
  const hasRain = peak?.precipitationMm > 0;
  const missingRain = hours.some(h => h.precipitationMm == null);
  const ceiling = Math.max(1, ...hours.map(h => h.precipitationMm || 0));
  const suggestion = WEATHER_LOCATIONS.find(l => l.id === geo.locationId);
  const suggestionInScope = locations.some(l => l.id === geo.locationId);
  const canLocate = active || localPreview;
  useEffect(() => {
    const generationRef = geoGeneration;
    const timer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => { clearInterval(timer); generationRef.current++; };
  }, []);
  useEffect(() => { if (!active && !localPreview) { geoGeneration.current++; setGeo({ kind: 'idle' }); } }, [active, localPreview]);
  useEffect(() => {
    if (!canLocate) return undefined;
    return observePermission(() => {
      geoGeneration.current++;
      setGeo({ kind: 'error', denied: true, message: locationError({ code: 1 }) });
      const saved = readWeatherPreference(sessionStorage, userKey);
      if (saved.source === 'nearby') {
        const next = { ...saved, source: 'manual', dismissed: true };
        setPreference(next); writeWeatherPreference(sessionStorage, next, userKey);
      }
    });
  }, [canLocate, userKey, observePermission]);

  function choose(id, source = 'manual') {
    geoGeneration.current++; setGeo({ kind: 'idle' });
    const next = { ...preference, selectedId: id, source, dismissed: source === 'manual' ? true : preference.dismissed };
    setPreference(next); writeWeatherPreference(sessionStorage, next, userKey); setPage(0); setSelectedHour(null);
  }
  function dismiss() {
    geoGeneration.current++; setGeo({ kind: 'idle' });
    const next = { ...preference, source: 'manual', dismissed: true };
    setPreference(next); writeWeatherPreference(sessionStorage, next, userKey);
  }
  async function findLocation() {
    const generation = ++geoGeneration.current;
    setGeo({ kind: 'locating' });
    try {
      const result = suggestWeatherPoint(await locate());
      if (generation !== geoGeneration.current) return;
      setGeo(result.kind === 'suggested' ? result : { kind: 'error', message: result.kind === 'outside-pilot'
        ? 'Chưa có điểm dự báo gần vị trí của bạn trong danh sách pilot. Hãy chọn địa điểm thủ công.' : result.kind === 'inaccurate'
          ? 'Vị trí chưa đủ chính xác để đề xuất điểm. Hãy chọn địa điểm.' : 'Vị trí đã cũ hoặc không hợp lệ. Hãy thử lại.' });
    } catch (error) {
      if (generation === geoGeneration.current) setGeo({ kind: 'error', denied: error?.code === 1, message: locationError(error) });
    }
  }
  return <section className="home-panel weather-overview weather-atmospheric" aria-label="Dự báo mưa">
    <div className="weather-compact">
      <div className="weather-compact-current">
        <WeatherPaperIcon hour={hours[0]} />
        <div>
          <label className="weather-city-label"><span>Thời tiết</span>{location && <select aria-label="Địa điểm dự báo" value={selectedId} onChange={event => choose(event.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}</label>
          {hasForecast && forecast.current?.temperatureC != null && forecast.current.at
            ? <strong className="weather-compact-temperature">{weatherNumber(forecast.current.temperatureC)}<small>°C</small></strong>
            : <strong className="weather-compact-fallback">{location?.name || 'Dự báo mưa'}</strong>}
        </div>
      </div>
      <div className="weather-compact-summary">
        <h3>{!hasForecast ? 'Chưa có dự báo hiện hành' : hasRain ? `Mưa cao nhất ${weatherLabel(peak.start)}–${weatherLabel(peak.end)}`
          : !peak || missingRain ? 'Chưa đủ dữ liệu lượng mưa' : `${hours.length} giờ tới chưa có mưa dự báo`}</h3>
        <p>{hasRain ? `${weatherNumber(peak.precipitationMm)} mm trong giờ cao nhất · ${weatherNumber(peak.precipitationProbabilityPct)}% khả năng mưa tại giờ đó`
          : hasForecast && peak && !missingRain ? `0 mm mưa dự báo · ${hours.length} giờ tới` : 'Dự báo riêng với kỳ KPI · Giờ Việt Nam'}</p>
      </div>
      <button type="button" className="weather-expand" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Thu gọn' : 'Xem dự báo'}{expanded ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
      </button>
    </div>
    <div className="weather-compact-metadata">
      <span>Điểm thành phố · Chưa phải từng Hub · Giờ Việt Nam</span>
      {hasForecast && forecast.current?.at && <span>Nhiệt độ cập nhật {weatherLabel(forecast.current.at)}</span>}
      <span><a href="https://www.weatherapi.com/" target="_blank" rel="noreferrer">WeatherAPI.com</a>{hasForecast ? ` · Lấy lúc ${weatherLabel(forecast.fetchedAt, { day: '2-digit', month: '2-digit' })}` : ''}</span>
    </div>
    {!selectedRegions.length ? <p className="weather-notice">Chọn vùng vận hành để xem các điểm dự báo.</p>
      : !locations.length ? <p className="weather-notice">Chưa có điểm dự báo đã xác minh cho vùng đang chọn.</p> : <>
      {localPreview ? <p className="weather-notice">Chế độ xem thử: dự báo thật cần phiên đăng nhập và cấu hình API.</p>
        : !active ? <p className="weather-notice">Dự báo sẵn sàng sau khi hoàn tất đăng nhập và chọn Client.</p> : null}
      {request.loading && <p className="weather-notice" role="status">Đang tải dự báo mưa…</p>}
      {request.error && <div className="weather-notice" role="alert"><p>{request.error.message}</p>{request.error.code !== 'WEATHER_CONFIG_MISSING' && request.error.code !== 'WEATHER_CACHE_CONFIG' && <button type="button" className="nav-btn-sleek" onClick={request.reload}>Thử lại dự báo</button>}</div>}
      {request.errors.some(error => error.locationId === selectedId) && <div className="weather-notice" role="alert">Không tải được dự báo tại {location.name}. <button type="button" className="nav-btn-sleek" onClick={request.reload}>Thử lại</button></div>}
      {forecast && !hours.length && <div className="weather-notice" role="status">Bản dự báo đã hết thời hạn hiển thị. <button type="button" className="nav-btn-sleek" onClick={request.reload}>Lấy dự báo mới</button></div>}
      {forecast?.stale && hasForecast && <p className="weather-stale" role="status">Bản dự báo đã lưu lúc {weatherLabel(forecast.fetchedAt)} · Chưa làm mới được.</p>}
    </>}
    <div className="weather-expanded" id={detailsId} hidden={!expanded}>
    <div className="weather-heading"><div><h2>Dự báo theo giờ</h2><p>Lượng mưa và khả năng mưa là hai chỉ số riêng.</p></div>
      <div className="weather-horizon" role="group" aria-label="Khoảng dự báo">{[12, 24].map(n => <button type="button" key={n} aria-pressed={horizon === n} onClick={() => { setHorizon(n); setPage(0); setSelectedHour(null); }}>{n} giờ</button>)}</div>
    </div>
    <details className="weather-location-settings"><summary>Địa điểm và gợi ý vị trí</summary>
    <div className="weather-geolocation" aria-live="polite">
      <div><strong><MapPin size={16} aria-hidden="true" />{geo.kind === 'suggested' ? suggestionInScope ? `Đề xuất điểm ${suggestion.name}` : `${suggestion.name} ngoài vùng đang chọn`
        : geo.kind === 'locating' ? 'Đang tìm vị trí…' : geo.kind === 'error' ? 'Chưa có gợi ý vị trí'
          : preference.source === 'nearby' && selectedId === preference.selectedId ? 'Địa điểm đã chọn từ gợi ý vị trí' : preference.dismissed ? 'Địa điểm chọn thủ công' : 'Gợi ý thời tiết gần bạn'}</strong>
        <p>{geo.kind === 'suggested' ? `Điểm công khai gần nhất cách vị trí khoảng ${weatherNumber(geo.distanceKm)} km; độ chính xác vị trí khoảng ${weatherNumber(geo.accuracyKm)} km. Dự báo tại điểm này, chưa đại diện cho vị trí của bạn.`
          : geo.kind === 'error' ? geo.message : preference.dismissed ? 'Bạn có thể dùng vị trí khi cần gợi ý điểm gần mình.' : 'Cho phép vị trí để gợi ý điểm dự báo. Bạn vẫn có thể chọn địa điểm thủ công.'}</p>
      </div>
      <div className="weather-geo-actions">
        {geo.kind === 'suggested' ? <>{suggestionInScope && <button type="button" className="nav-btn-sleek weather-primary" onClick={() => choose(suggestion.id, 'nearby')}>Dùng card {suggestion.name}</button>}<button type="button" className="nav-btn-sleek" onClick={dismiss}>Chọn thủ công</button></>
          : <>{!geo.denied && <button type="button" className="nav-btn-sleek" disabled={!canLocate || geo.kind === 'locating'} onClick={findLocation}><LocateFixed size={16} aria-hidden="true" />{geo.kind === 'locating' ? 'Đang định vị' : 'Dùng vị trí của tôi'}</button>}
            {(geo.kind === 'locating' || !preference.dismissed || preference.source === 'nearby') && <button type="button" className="nav-btn-sleek" onClick={dismiss}>{preference.source === 'nearby' ? 'Ngừng dùng vị trí' : 'Để sau'}</button>}</>}
      </div>
    </div>
    {locations.length > 0 && <>
        <label className="weather-mobile-picker">Địa điểm <select value={selectedId} onChange={event => choose(event.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <div className="weather-location-cards">{[...locations].sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id))).slice(0, 3).map(l => {
          const data = request.forecasts.find(f => f.locationId === l.id);
          const values = weatherHours(data, horizon, clock).map(h => h.precipitationMm).filter(v => v != null);
          return <div className="weather-location-item" key={l.id}><button type="button" className="weather-location" aria-pressed={selectedId === l.id} onClick={() => choose(l.id)}><strong>{l.name}</strong><span>Điểm đại diện thành phố</span><small>{values.length ? `Cao nhất ${weatherNumber(Math.max(...values))} mm/giờ` : 'Chưa có dự báo'}</small></button>
            <button type="button" className="weather-pin" aria-label={`${pinnedIds.includes(l.id) ? 'Bỏ ghim' : 'Ghim'} ${l.name}`} aria-pressed={pinnedIds.includes(l.id)} onClick={() => { const next = { ...preference, pinnedIds: pinnedIds.includes(l.id) ? pinnedIds.filter(id => id !== l.id) : [...pinnedIds, l.id].slice(-3) }; setPreference(next); writeWeatherPreference(sessionStorage, next, userKey); }}>{pinnedIds.includes(l.id) ? <PinOff size={15} /> : <Pin size={15} />}</button></div>;
        })}</div>
    </>}
    </details>
        {forecast && hours.length > 0 && <>
          <p className="weather-chart-caption">Lượng mưa mỗi giờ (mm) · Nhãn phía trên: khả năng mưa (%)</p>
          <div className="weather-chart"><div className="weather-y-axis" aria-hidden="true"><span>{weatherNumber(ceiling)}</span><span>{weatherNumber(ceiling / 2)}</span><span>0</span></div>
            <div className="weather-bars" style={{ '--weather-columns': hours.length }}>{hours.map((h, index) => <button type="button" key={h.start} className={`weather-hour${Math.floor(index / 4) === safePage ? ' weather-mobile-hour' : ''}`} aria-pressed={hour?.start === h.start}
              aria-label={`${weatherLabel(h.start, { day: '2-digit', month: '2-digit' })} đến ${weatherLabel(h.end)}, ${weatherNumber(h.precipitationMm)} mm mưa, ${weatherNumber(h.precipitationProbabilityPct)}% khả năng mưa`}
              onClick={() => setSelectedHour(h.start)}><span className="weather-probability">{weatherNumber(h.precipitationProbabilityPct)}%</span><span className={`weather-bar${h.precipitationMm == null ? ' weather-bar-missing' : ''}`} style={{ height: `${h.precipitationMm == null ? 0 : h.precipitationMm / ceiling * 100}px` }} /><span className="weather-hour-label">{weatherLabel(h.start)}</span></button>)}</div>
          </div>
          <div className="weather-pager"><button type="button" className="nav-btn-sleek" aria-label="4 giờ trước" disabled={safePage === 0} onClick={() => { setPage(safePage - 1); setSelectedHour(hours[(safePage - 1) * 4].start); }}><ChevronLeft size={17} /></button><span>{weatherLabel(hours[safePage * 4].start)}–{weatherLabel(hours[Math.min(hours.length - 1, safePage * 4 + 3)].end)} · 0–{weatherNumber(ceiling)} mm</span><button type="button" className="nav-btn-sleek" aria-label="4 giờ tiếp theo" disabled={(safePage + 1) * 4 >= hours.length} onClick={() => { setPage(safePage + 1); setSelectedHour(hours[(safePage + 1) * 4].start); }}><ChevronRight size={17} /></button></div>
          {hour && <div className="weather-hour-detail" aria-live="polite"><strong>{weatherLabel(hour.start, { day: '2-digit', month: '2-digit' })}–{weatherLabel(hour.end)}</strong><span>{weatherNumber(hour.precipitationMm)} mm mưa</span><span>{weatherNumber(hour.precipitationProbabilityPct)}% khả năng mưa</span></div>}
          <div className="weather-metadata"><span>{weatherLabel(hours[0].start, { day: '2-digit', month: '2-digit' })} → {weatherLabel(hours.at(-1).end, { day: '2-digit', month: '2-digit' })} · {location.name}</span></div>
        </>}
    </div>
    {missing.length > 0 && <details className="weather-coverage"><summary>{missing.length} vùng chưa có điểm dự báo</summary><p>{missing.join(', ')}</p></details>}
  </section>;
}
