import { easeInOutCubic } from './rankingSceneLayout.js';
import { sceneVehicleKind } from './sceneVehicles.js';
import { CRUISE_SPEED } from './sceneDriving.js';

export const SCENE_IDLE_DELAY_MS = 10_000;
export const IDLE_STORAGE_KEY = 'ghn-ranking-idle-enabled';
export const TRAFFIC_EXTRA_COUNT = 6;
const TRUCK_GAP = 4.8;
const BIKE_GAP = 2.8;
const FORM_SPREAD_SECONDS = 3.2;
const FORM_LANES_SECONDS = 2.8;
const lerp = (a, b, t) => a + (b - a) * t;
const randomBetween = (random, min, max) => min + random() * (max - min);

// A fixed instance pool avoids allocating/remounting meshes at each arrival.
// These are traffic actors, never Hub records, selectable rows or fake ranks.
export function createTrafficExtras(items) {
  if (!items.length) return [];
  const rear = Math.min(...items.map(item => item.x)) - 12;
  return Array.from({ length: TRAFFIC_EXTRA_COUNT }, (_, index) => ({
    id: `traffic-extra-${index}`, ambient: true, x: rear - index * 6, z: 0,
    item: { hubType: index % 3 === 0 ? 'GXT' : 'BC' }, meetsTarget: false
  }));
}

export function createIdleTraffic(items, roadWidth = 11) {
  const originals = items.filter(item => !item.ghost && !item.ambient).slice().sort((a, b) => b.x - a.x);
  const leader = originals[0];
  const lanes = { truck: -roadWidth * 0.16, rider: roadWidth * 0.24, pass: roadWidth * 0.075, shoulder: -roadWidth / 2 + 0.85 };
  const cars = new Map();
  for (const item of [...originals, ...items.filter(item => item.ambient)]) {
    const kind = sceneVehicleKind(item);
    cars.set(item.id, { id: item.id, kind, ambient: Boolean(item.ambient), leader: item === leader,
      home: item.x, homeZ: item.z, x: item.x, z: item.z, speed: CRUISE_SPEED,
      alpha: item.ambient ? 0 : 1, phase: item.ambient ? 'absent' : 'rank',
      nextAction: 0, preferredSpeed: CRUISE_SPEED, unloadProgress: 0, steering: 0 });
  }
  return { cars, lanes, mode: 'rank', active: false, returning: false, time: 0,
    elapsed: 0, leaderId: leader?.id, leaderX: leader?.x ?? 0,
    rear: (leader?.x ?? 0) - Math.max(70, originals.length * TRUCK_GAP + 12),
    nextArrival: 0, backwards: 0, stats: { passAttempts: 0, overtakes: 0, unloads: 0, merges: 0, arrivals: 0, departures: 0 } };
}

function startFormation(state, random) {
  state.mode = 'forming';
  state.elapsed = 0;
  let index = 0;
  // First spread along the original four lanes, then move sideways. The
  // longitudinal ordering never reverses during entry, and lane merges happen
  // only once every vehicle has truck-length clearance from its neighbours.
  for (const car of state.cars.values()) {
    if (car.ambient) { car.alpha = 0; car.phase = 'absent'; continue; }
    car.fromX = car.x;
    car.fromZ = car.z;
    car.formationX = state.leaderX - index++ * TRUCK_GAP;
    car.phase = 'forming';
    car.nextAction = state.time + randomBetween(random, 7, 18);
    car.preferredSpeed = car.leader ? CRUISE_SPEED : randomBetween(random, car.kind === 'rider' ? 2.5 : 1.8, car.kind === 'rider' ? 4.1 : 3.1);
  }
  state.nextArrival = state.time + FORM_SPREAD_SECONDS + FORM_LANES_SECONDS + randomBetween(random, 2, 5);
}

function transitionLane(car, targetZ, phase, state, duration = 2.2) {
  car.phase = phase;
  car.laneFrom = car.z;
  car.laneTo = targetZ;
  car.laneStart = state.time;
  car.laneDuration = duration;
}

function laneClear(state, car, z, front = 6, back = 7) {
  for (const other of state.cars.values()) {
    // Arriving/fading actors still reserve space until they actually leave.
    if (other === car || other.phase === 'absent') continue;
    const nearLane = Math.abs(other.z - z) < 1.65 || (other.laneTo !== undefined && Math.abs(other.laneTo - z) < 1.65);
    if (nearLane && other.x - car.x < front && car.x - other.x < back) return false;
  }
  return true;
}

const occupiesLane = (a, b) => Math.abs(a.z - b.z) < (a.kind === 'truck' || b.kind === 'truck' ? 1.9 : 1.25)
  || (a.laneTo !== undefined && Math.abs(a.laneTo - b.z) < 1.4)
  || (b.laneTo !== undefined && Math.abs(b.laneTo - a.z) < 1.4);
const gapFor = (a, b) => a.kind === 'rider' && b.kind === 'rider' ? BIKE_GAP : TRUCK_GAP;

function chooseAction(state, car, random) {
  if (car.leader || state.time < car.nextAction || car.phase !== 'cruise') return;
  car.nextAction = state.time + randomBetween(random, 5, 14);
  car.preferredSpeed = randomBetween(random, car.kind === 'rider' ? 2.6 : 1.8, car.kind === 'rider' ? 4.1 : 3.1);
  if (car.kind === 'truck') {
    const busy = [...state.cars.values()].filter(other => ['pulling-in', 'unloading', 'waiting', 'merging'].includes(other.phase)).length;
    if (busy < 2 && car.x < state.leaderX - 10 && car.x > state.rear + 16 && random() < 0.55
      && laneClear(state, car, state.lanes.shoulder, 10, 10)) {
      transitionLane(car, state.lanes.shoulder, 'pulling-in', state, 3);
      car.unloadDuration = randomBetween(random, 8, 16);
      car.unloadProgress = 0;
    }
  } else {
    const ahead = [...state.cars.values()].filter(other => other !== car && other.kind === 'rider' && other.alpha > 0.5
      && other.x > car.x && other.x - car.x < 15 && Math.abs(other.z - state.lanes.rider) < 0.5)
      .sort((a, b) => a.x - b.x)[0];
    if (ahead && ahead.speed < car.preferredSpeed - 0.2 && random() < 0.8 && laneClear(state, car, state.lanes.pass, 4, 4)) {
      car.passId = ahead.id;
      car.passCompleted = false;
      transitionLane(car, state.lanes.pass, 'lane-out', state, 1.8);
      state.stats.passAttempts++;
    }
  }
}

function advanceActions(state, car, random) {
  if (car.laneTo !== undefined) {
    const t = Math.min(1, (state.time - car.laneStart) / car.laneDuration);
    car.z = lerp(car.laneFrom, car.laneTo, easeInOutCubic(t));
    if (t === 1) {
      delete car.laneTo;
      if (car.phase === 'lane-out') car.phase = 'passing';
      else if (car.phase === 'lane-in' || car.phase === 'merging') {
        if (car.phase === 'merging') state.stats.merges++;
        car.phase = 'cruise';
        car.nextAction = state.time + randomBetween(random, 7, 18);
      }
    }
  }
  if (car.phase === 'pulling-in' && car.laneTo === undefined && car.speed < 0.08) {
    car.phase = 'unloading';
    car.unloadStarted = state.time;
    state.stats.unloads++;
  }
  if (car.phase === 'unloading') {
    car.unloadProgress = Math.min(1, (state.time - car.unloadStarted) / car.unloadDuration);
    if (car.unloadProgress === 1) car.phase = 'waiting';
  }
  if (car.phase === 'waiting' && laneClear(state, car, state.lanes.truck, 9, 12)) {
    transitionLane(car, state.lanes.truck, 'merging', state, 3);
  }
  if (car.phase === 'passing') {
    const passed = state.cars.get(car.passId);
    if (passed && car.x > passed.x + BIKE_GAP + 0.8 && !car.passCompleted) {
      state.stats.overtakes++;
      car.passCompleted = true;
    }
    if ((!passed || passed.alpha < 0.1 || car.x > passed.x + BIKE_GAP + 0.8)
      && laneClear(state, car, state.lanes.rider, 4.2, 4.2)) {
      transitionLane(car, state.lanes.rider, 'lane-in', state, 1.8);
    }
  }
  chooseAction(state, car, random);
}

function spawnTraffic(state, random) {
  if (state.time < state.nextArrival) return;
  state.nextArrival = state.time + randomBetween(random, 3, 7);
  const car = [...state.cars.values()].find(candidate => candidate.ambient && candidate.phase === 'absent');
  if (!car) return;
  car.x = Math.max(state.rear + 8, state.leaderX - randomBetween(random, 38, 62));
  car.z = state.lanes[car.kind];
  delete car.laneTo;
  delete car.passId;
  car.unloadProgress = 0;
  if (!laneClear(state, car, car.z, car.kind === 'rider' ? 3.5 : 5.5, car.kind === 'rider' ? 3.5 : 5.5)) return;
  car.alpha = 0;
  car.phase = 'cruise';
  car.bornAt = state.time;
  car.speed = CRUISE_SPEED;
  car.preferredSpeed = randomBetween(random, car.kind === 'rider' ? 3.2 : 2, car.kind === 'rider' ? 4.3 : 2.8);
  car.nextAction = state.time + randomBetween(random, 5, 10);
  car.expiresAt = state.time + randomBetween(random, 24, 45);
  state.stats.arrivals++;
}

function driveTraffic(state, dt, random, roadSpeed) {
  spawnTraffic(state, random);
  const ordered = [...state.cars.values()].filter(car => car.phase !== 'absent').sort((a, b) => b.x - a.x);
  for (const car of ordered) {
    if (car.leader) { car.x = state.leaderX; car.speed = roadSpeed; continue; }
    advanceActions(state, car, random);
    const parked = car.phase === 'unloading' || car.phase === 'waiting';
    let desired = parked || car.phase === 'pulling-in' ? 0 : car.phase === 'passing' || car.phase === 'lane-out' ? 4.4 : car.preferredSpeed;
    let ceiling = state.leaderX - TRUCK_GAP;
    for (const ahead of ordered) {
      if (ahead === car || ahead.phase === 'absent' || ahead.x <= car.x || !occupiesLane(car, ahead)) continue;
      const gap = gapFor(car, ahead);
      ceiling = Math.min(ceiling, ahead.x - gap);
      desired = Math.min(desired, Math.max(0, ahead.speed + (ahead.x - car.x - gap) * 0.9));
    }
    desired = Math.min(desired, Math.max(0, roadSpeed + (state.leaderX - TRUCK_GAP - car.x) * 0.9));
    const acceleration = desired > car.speed ? 1.1 : 2;
    car.speed += Math.max(-acceleration * dt, Math.min(acceleration * dt, desired - car.speed));
    if (parked) car.speed = 0;
    const previousX = car.x;
    car.x = parked ? car.x - roadSpeed * dt : Math.min(ceiling, car.x + (car.speed - roadSpeed) * dt);
    car.speed = parked ? 0 : Math.max(0, roadSpeed + (car.x - previousX) / dt);
    if (car.ambient) {
      car.alpha = Math.min(1, (state.time - car.bornAt) / 1.2);
      if (state.time > car.expiresAt) car.alpha *= Math.max(0, 1 - (state.time - car.expiresAt) / 2);
    }
    // Vehicles leave the bounded road at the rear. Re-entry is an event with
    // a gap check and a new schedule, rather than a repeating animation path.
    if (car.x < state.rear + 3) car.alpha = Math.max(0, (car.x - state.rear) / 3);
    if (car.x < state.rear || (car.ambient && car.alpha === 0 && state.time > car.expiresAt)) {
      car.alpha = 0;
      car.phase = 'absent';
      car.respawnAt = state.time + randomBetween(random, 3, 8);
      state.stats.departures++;
    }
  }
  for (const car of state.cars.values()) {
    if (car.ambient || car.phase !== 'absent' || state.time < car.respawnAt) continue;
    car.x = state.rear + 1;
    car.z = state.lanes[car.kind];
    delete car.laneTo;
    delete car.passId;
    if (!laneClear(state, car, car.z, 7, 7)) continue;
    car.speed = CRUISE_SPEED;
    car.phase = 'cruise';
    car.alpha = 1 / 3;
    car.nextAction = state.time + randomBetween(random, 6, 12);
  }
}

export function advanceIdleTraffic(state, delta, idle, random = Math.random, roadSpeed = CRUISE_SPEED) {
  const dt = Math.max(0, Math.min(0.2, delta));
  state.backwards = 0;
  if (!dt) return;
  if (!idle && state.mode === 'rank') return;
  state.time += dt;
  if (idle && !state.active) startFormation(state, random);
  if (!idle && state.active) {
    state.mode = 'returning';
    state.elapsed = 0;
    state.returnDuration = 4.8;
    for (const car of state.cars.values()) {
      car.fromX = car.x; car.fromZ = car.z; car.fromAlpha = car.alpha;
      delete car.laneTo;
      state.returnDuration = Math.max(state.returnDuration, Math.min(12, Math.abs(car.x - car.home) / 12));
    }
  }
  state.active = idle;
  state.returning = state.mode === 'returning';
  const before = new Map([...state.cars.values()].map(car => [car.id, { x: car.x, z: car.z }]));
  if (state.mode === 'forming') {
    state.elapsed += dt;
    const spread = easeInOutCubic(state.elapsed / FORM_SPREAD_SECONDS);
    const lane = easeInOutCubic((state.elapsed - FORM_SPREAD_SECONDS) / FORM_LANES_SECONDS);
    for (const car of state.cars.values()) {
      if (car.ambient) continue;
      car.x = lerp(car.fromX, car.formationX, spread);
      car.z = lerp(car.fromZ, state.lanes[car.kind], lane);
      car.alpha = 1;
    }
    if (state.elapsed >= FORM_SPREAD_SECONDS + FORM_LANES_SECONDS) {
      state.mode = 'traffic';
      for (const car of state.cars.values()) if (!car.ambient) { car.phase = 'cruise'; car.speed = roadSpeed; }
    }
  } else if (state.mode === 'traffic') driveTraffic(state, dt, random, roadSpeed);
  else if (state.mode === 'returning') {
    state.elapsed += dt;
    const t = Math.min(1, state.elapsed / state.returnDuration), e = easeInOutCubic(t);
    for (const car of state.cars.values()) {
      car.x = car.ambient ? car.fromX - e * 18 : t === 1 ? car.home : lerp(car.fromX, car.home, e);
      car.z = car.ambient ? car.fromZ : t === 1 ? car.homeZ : lerp(car.fromZ, car.homeZ, e);
      car.alpha = car.ambient ? car.fromAlpha * Math.max(0, 1 - state.elapsed / 2) : lerp(car.fromAlpha, 1, Math.min(1, state.elapsed));
      car.phase = car.ambient ? 'departing' : 'returning';
      car.unloadProgress = 0;
    }
    if (t === 1) {
      state.mode = 'rank'; state.returning = false;
      for (const car of state.cars.values()) car.phase = car.ambient ? 'absent' : 'rank';
    }
  }
  for (const car of state.cars.values()) {
    const previous = before.get(car.id);
    if (car.alpha < 0.01) { car.steering = 0; continue; }
    const dx = car.x - previous.x;
    // Formation/return use the same forward-travel compensation as rank
    // transitions. Parked vehicles in traffic instead match the road exactly.
    if (state.mode !== 'traffic' && !car.ambient) state.backwards = Math.max(state.backwards, -dx);
    car.steering = Math.max(-0.35, Math.min(0.35, -Math.atan2((car.z - previous.z) / dt, Math.max(0.6, roadSpeed + dx / dt))));
  }
}

// Only absence counts, never a stationary pointer inside the page. One timeout
// per departure; hidden tabs may throttle it, so also reconcile on visibility.
export function observeSceneAbsence({ win, doc, onChange, now = () => performance.now(),
  schedule = (fn, ms) => win.setTimeout(fn, ms), cancel = id => win.clearTimeout(id) }) {
  let departedAt = null;
  let timer = null;
  const clear = () => { if (timer !== null) cancel(timer); timer = null; };
  const check = () => {
    clear();
    if (departedAt === null) return;
    const remaining = SCENE_IDLE_DELAY_MS - (now() - departedAt);
    if (remaining <= 0) onChange(true);
    else timer = schedule(check, remaining);
  };
  const leave = () => {
    if (departedAt !== null) return;
    departedAt = now();
    check();
  };
  const enter = () => {
    if (doc.hidden) return;
    departedAt = null;
    clear();
    onChange(false);
  };
  const pointerLeave = event => { if (event.pointerType !== 'touch') leave(); };
  const visibility = () => { if (doc.hidden) leave(); else check(); };
  const listeners = [
    [win, 'blur', leave], [win, 'focus', enter],
    [doc, 'visibilitychange', visibility],
    [doc.documentElement, 'pointerleave', pointerLeave],
    [doc.documentElement, 'pointerenter', enter],
    [doc, 'pointermove', enter], [doc, 'pointerdown', enter], [doc, 'keydown', enter]
  ];
  for (const [target, name, handler] of listeners) target.addEventListener(name, handler);
  if (doc.hidden || !doc.hasFocus()) leave();
  return () => {
    clear();
    for (const [target, name, handler] of listeners) target.removeEventListener(name, handler);
  };
}


