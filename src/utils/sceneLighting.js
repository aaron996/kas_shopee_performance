// One stylised solar day takes six active minutes, independent of truck speed.
export const DAY_CYCLE_SECONDS = 360;
export const INITIAL_DAY_PHASE = 9 / 24;
export const LIGHTING_MODES = ['auto', 'day', 'night'];
const TAU = Math.PI * 2;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = (a, b, value) => { const t = clamp01((value - a) / (b - a)); return t * t * (3 - 2 * t); };

export function wrapDayPhase(phase) {
  return Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : INITIAL_DAY_PHASE;
}

export function advanceDayPhase(phase, delta, running = true, cycleSeconds = DAY_CYCLE_SECONDS) {
  // A resumed/background tab must not skip hours. Never tie this to playbackRate.
  const step = running && Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
  const duration = Number.isFinite(cycleSeconds) && cycleSeconds > 0 ? cycleSeconds : DAY_CYCLE_SECONDS;
  return wrapDayPhase(wrapDayPhase(phase) + step / duration);
}

export function phaseForLightingMode(mode, phase) {
  return mode === 'day' ? 12 / 24 : mode === 'night' ? 0 : wrapDayPhase(phase);
}

export function formatSceneTime(phase) {
  const minutes = Math.floor(wrapDayPhase(phase) * 1440 + 1e-8) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function mixColor(from, to, t) {
  const channel = offset => Math.round(parseInt(from.slice(offset, offset + 2), 16) * (1 - t) + parseInt(to.slice(offset, offset + 2), 16) * t).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function sampleSceneLighting(phase) {
  const time = wrapDayPhase(phase);
  // Sunrise 06:00, noon 12:00, sunset 18:00. Moon is opposite the sun.
  const angle = (time - 0.25) * TAU;
  const altitude = Math.sin(angle);
  const across = Math.cos(angle);
  const norm = Math.hypot(across, altitude, across * -0.45);
  const sunDirection = [across / norm, altitude / norm, across * -0.45 / norm];
  const moonDirection = sunDirection.map(value => -value);
  const day = smooth(-0.12, 0.3, altitude);
  const twilight = smooth(-0.23, -0.02, altitude) * (1 - smooth(0.08, 0.48, altitude));
  const sunIntensity = smooth(0, 0.22, altitude) * (1.4 + 0.8 * Math.max(0, altitude));
  const moonIntensity = 0.36 * smooth(0, 0.22, -altitude);
  const source = altitude >= 0 ? 'sun' : 'moon';
  const sunColor = mixColor('#ff9b55', '#fff2d5', smooth(0.03, 0.6, altitude));
  return {
    phase: time, day, twilight, sunDirection, moonDirection, source,
    streetlightPower: 1 - smooth(-0.04, 0.18, altitude),
    keyDirection: source === 'sun' ? sunDirection : moonDirection,
    keyIntensity: source === 'sun' ? sunIntensity : moonIntensity,
    keyColor: source === 'sun' ? sunColor : '#b4ccff',
    shadowIntensity: smooth(0.02, 0.24, Math.abs(altitude)) * (source === 'sun' ? 0.85 : 0.45),
    sunColor,
    sunOpacity: smooth(-0.06, 0.02, altitude),
    moonOpacity: smooth(-0.06, 0.02, -altitude),
    ambientIntensity: 0.46 + 1.15 * day + 0.15 * twilight,
    ambientSky: mixColor('#7e9bcc', '#e6f0ff', day),
    ambientGround: mixColor('#384453', '#8e9d78', day),
    skyTop: mixColor(mixColor('#071225', '#5e9bd4', day), '#656b9e', twilight * 0.45),
    horizon: mixColor(mixColor('#182a48', '#d8e9ed', day), '#f6b27b', twilight * 0.82)
  };
}
