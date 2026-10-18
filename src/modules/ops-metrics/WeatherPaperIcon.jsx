import { useState } from 'react';
import { Cloud } from 'lucide-react';
import { resolveWeatherIcon } from '../../utils/weatherIcon';
import './weatherPaperIcon.css';

export default function WeatherPaperIcon({ hour }) {
  const [failed, setFailed] = useState(false);
  const kind = resolveWeatherIcon(hour);
  if (!kind || failed) return <Cloud className="weather-paper-fallback" aria-hidden="true" />;
  return <span key={kind} className={`weather-paper-icon weather-paper-${kind}`} aria-hidden="true">
    <img src="/weather/weather-paper-v1.png" alt="" decoding="async" onError={() => setFailed(true)} />
  </span>;
}
