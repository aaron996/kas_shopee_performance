import { trafficInView } from './sceneVisibility.js';
// Decorative traffic interaction only: IDs/ranks/KPIs are never mutated.
export function createPolice() {
  return { phase: 'waiting', nextAt: 14, alpha: 0, x: 0, z: 0, speed: 0,
    wheelTravel: 0, targetId: null, elapsed: 0, checks: 0, checkedKinds: [] };
}

export function cancelPolice(state) {
  const p = state.police;
  if (!p) return;
  const target = state.cars.get(p.targetId);
  if (target?.phase.startsWith('police-')) {
    // An interrupted stop must still merge out of the shoulder. The ordinary
    // lane-change controller waits for clearance and clears policeStop on exit.
    target.phase = 'merging'; target.laneFrom = target.z;
    target.laneTo = target.roadLane; target.laneStart = state.time; target.laneDuration = 3;
  } else if (target) target.policeStop = false;
  Object.assign(p, { phase: 'waiting', alpha: 0, targetId: null, nextAt: state.time + 12, elapsed: 0 });
}

export function advancePolice(state, dt, random, roadSpeed, laneClear, transitionLane) {
  const p = state.police;
  if (state.mode !== 'traffic') { cancelPolice(state); return; }
  p.elapsed += dt;
  const target = state.cars.get(p.targetId);
  if (p.targetId && (!target || target.alpha < .8 || target.phase === 'absent')) {
    if (trafficInView(state,p.x,p.z)) { p.phase='depart';p.elapsed=0;p.targetId=null; }
    else cancelPolice(state);
    return;
  }
  // The truck cabin is ahead of its centre; the rider is at the bike centre.
  const stopGap = target?.kind === 'truck' ? 3.7 : 5;
  if (p.phase === 'waiting') {
    if (state.time < p.nextAt) return;
    const candidates = [...state.cars.values()].filter(c => !c.ambient && c.phase === 'cruise'
      && c.direction === 1 && c.alpha > .99 && c.x > state.rear + 65 && c.x < state.front - 12
      && laneClear(state, c, state.lanes.shoulder, 15, 15)
      && [...state.cars.values()].every(other => other === c || other.phase === 'absent' || Math.abs(other.x-c.x)>7)
      && laneClear(state, { x: c.x-13, z: state.lanes.shoulder, kind: 'rider' }, state.lanes.shoulder, 9, 9));
    const c = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    if (!c) { p.nextAt = state.time + 2; return; }
    let spawnX = c.x-13;
    while (trafficInView(state, spawnX, state.lanes.shoulder) && spawnX > c.x-90) spawnX -= 4;
    if (trafficInView(state, spawnX, state.lanes.shoulder)
      || !laneClear(state, {x:spawnX,kind:'rider'}, state.lanes.shoulder,9,9)) { p.nextAt=state.time+2;return; }
    Object.assign(p, { phase: 'chase', elapsed: 0, targetId: c.id,
      x: spawnX, z: state.lanes.shoulder, speed: c.speed, alpha: 1 });
    c.nextAction = state.time + 80;
    return;
  }
  if (p.phase === 'chase') {
    p.speed += Math.max(-2 * dt, Math.min(2 * dt, target.speed + Math.max(.1, (target.x - p.x - 5) * .7) - p.speed));
    for (const c of state.cars.values()) if (c.alpha > .1 && c.x > p.x && Math.abs(c.z-p.z)<1.6) {
      p.speed = Math.min(p.speed, Math.max(0, c.speed + (c.x-p.x-4)*.8));
    }
    p.x += (p.speed - roadSpeed) * dt;
    p.wheelTravel += p.speed * dt;
    if (p.elapsed > 45 || target.phase !== 'cruise') {
      p.phase='depart';p.elapsed=0;p.targetId=null;return;
    }
    if (target.x - p.x <= 6
      && [...state.cars.values()].every(other => other === target || other.phase === 'absent' || Math.abs(other.x-target.x)>7)) {
      transitionLane(target, state.lanes.shoulder, 'police-pull', state, 3);
      target.policeStop = true;
      p.phase = 'pull'; p.elapsed = 0; p.fromZ = p.z; p.fromGap = target.x - p.x;
    }
  } else if (p.phase === 'pull') {
    const t = Math.min(1, p.elapsed / 3), e = t*t*(3-2*t);
    p.z = p.fromZ + (state.lanes.shoulder - p.fromZ) * e;
    p.x = target.x - (p.fromGap + (stopGap-p.fromGap)*e); p.speed = target.speed; p.wheelTravel += p.speed * dt;
    if (target.laneTo === undefined && target.speed < .08) {
      target.phase = 'police-check'; p.phase = 'check'; p.elapsed = 0;
    }
  } else if (p.phase === 'check') {
    p.x = target.x - stopGap; p.speed = 0;
    if (p.elapsed >= 17) {
      p.phase = 'release'; p.elapsed = 0;
      p.checks++; p.checkedKinds = [...new Set([...p.checkedKinds, target.kind])];
    }
  } else if (p.phase === 'release') {
    // Officer waits on the shoulder while the inspected vehicle merges away.
    p.x -= roadSpeed * dt; p.speed = 0;
    if (target.phase === 'police-check' && laneClear(state, target, target.roadLane, 12, 15)) {
      transitionLane(target, target.roadLane, 'merging', state, 3);
    }
    if (target.phase === 'cruise') {
      p.phase = 'depart'; p.elapsed = 0; p.targetId = null;
    }
  } else if (p.phase === 'depart') {
    p.speed = Math.max(2, p.speed + dt);
    for (const c of state.cars.values()) if (c.alpha > .1 && c.x > p.x && Math.abs(c.z-p.z)<1.6) {
      p.speed = Math.min(p.speed, Math.max(0, c.speed + (c.x-p.x-4)*.8));
    }
    p.x += (p.speed-roadSpeed)*dt; p.wheelTravel += p.speed*dt;
    if (p.elapsed>=3 && !trafficInView(state,p.x,p.z)) {
      p.alpha=0;p.phase = 'waiting'; p.elapsed = 0; p.nextAt = state.time + 16 + random()*14;
    }
  }
}
