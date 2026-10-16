import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSceneLayout, getRoadLength } from './rankingSceneLayout.js';
import { createIdleTraffic, createTrafficExtras, advanceIdleTraffic, observeSceneAbsence, SCENE_IDLE_DELAY_MS } from './sceneIdle.js';
import { CRUISE_SPEED } from './sceneDriving.js';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function presence() {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.documentElement = new EventTarget();
  doc.hidden = false;
  doc.hasFocus = () => true;
  let time = 0, sequence = 0;
  const timers = new Map(), states = [];
  const dispose = observeSceneAbsence({ win, doc, onChange: value => states.push(value), now: () => time,
    schedule: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, at: time + ms }); return id; },
    cancel: id => timers.delete(id) });
  return { win, doc, timers, states, dispose,
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); }
    } };
}
const fire = (target, name) => target.dispatchEvent(new Event(name));

test('absence starts at departure, requires 10 seconds, and cancels on return', () => {
  const p = presence();
  p.advance(60_000);
  assert.deepEqual(p.states, []); // stationary pointer is not absence
  fire(p.doc.documentElement, 'pointerleave');
  p.advance(SCENE_IDLE_DELAY_MS - 1);
  assert.deepEqual(p.states, []);
  p.advance(1);
  assert.deepEqual(p.states, [true]);
  fire(p.doc, 'pointermove');
  assert.equal(p.states.at(-1), false);
  fire(p.win, 'blur');
  p.advance(9000);
  fire(p.win, 'focus');
  p.advance(2000);
  assert.equal(p.states.at(-1), false);
  assert.equal(p.timers.size, 0);
  p.dispose();
});

test('blur plus hidden shares the first departure deadline; listeners and timers clean up', () => {
  const p = presence();
  fire(p.win, 'blur');
  p.advance(5000);
  p.doc.hidden = true;
  fire(p.doc, 'visibilitychange');
  p.advance(5000);
  assert.equal(p.states.at(-1), true);
  p.doc.hidden = false;
  fire(p.doc, 'pointerdown');
  assert.equal(p.states.at(-1), false);
  fire(p.win, 'blur');
  p.dispose();
  assert.equal(p.timers.size, 0);
  const count = p.states.length;
  fire(p.doc, 'pointermove');
  p.advance(20_000);
  assert.equal(p.states.length, count);
});

test('touch leaving the document does not start a departure', () => {
  const p = presence();
  const event = new Event('pointerleave');
  event.pointerType = 'touch';
  p.doc.documentElement.dispatchEvent(event);
  p.advance(20_000);
  assert.deepEqual(p.states, []);
  p.dispose();
});

function fleet(count, view = 'best', kind = 'mixed') {
  const hubs = Array.from({ length: count }, (_, i) => ({ id: `hub-${i}`, hubType: kind === 'bikes' || (kind === 'mixed' && i % 3 === 0) ? 'BC' : 'GXT' }));
  const slots = computeSceneLayout(hubs, { roadLength: getRoadLength(count), laneWidth: 2.6, leaderGap: 6, view })
    .map((slot, i) => ({ ...slot, item: hubs[i] }));
  return [...slots, ...createTrafficExtras(slots)];
}

function collision(a, b) {
  const length = (a.kind === 'truck' ? 1.55 : 1.12) + (b.kind === 'truck' ? 1.55 : 1.12);
  const width = (a.kind === 'truck' ? 1 : 0.5) + (b.kind === 'truck' ? 1 : 0.5);
  return Math.abs(a.x - b.x) < length && Math.abs(a.z - b.z) < width;
}

for (const view of ['best', 'worst']) for (const count of [10, 20, 50]) {
  test(`${view} ${count}: separate lanes, safe overtaking, delivery stops, ambient arrivals and exact recovery`, () => {
    const slots = fleet(count, view), original = structuredClone(slots);
    const state = createIdleTraffic(slots), random = seeded(42);

    const phases = new Set();
    let parkedFrames = 0, extraVisible = false;
    for (let frame = 0; frame < 21600; frame++) {
      const previous = new Map([...state.cars.values()].map(car => [car.id, { x: car.x, phase: car.phase }]));
      advanceIdleTraffic(state, 1 / 60, true, random);

      const visible = [...state.cars.values()].filter(car => car.alpha > 0.1);
      for (const car of visible) {
        assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z));
        assert.ok(car.x <= state.front + 1);
        assert.ok(car.alpha <= 1 && car.alpha >= 0);
        phases.add(car.phase);
        if (car.ambient) extraVisible = true;
        if (state.mode === 'traffic') {
          if (previous.get(car.id).phase !== 'absent' && car.direction !== -1 && car.phase !== 'turning') assert.ok(car.x - previous.get(car.id).x + CRUISE_SPEED / 60 >= -1e-7, `${car.id} never reverses: dx=${car.x - previous.get(car.id).x}, frame=${frame}, near=${JSON.stringify([...state.cars.values()].filter(other => Math.abs(other.x - car.x) < 12).map(other => ({id:other.id,x:other.x,z:other.z,phase:other.phase,laneTo:other.laneTo})))}`);
          if (car.kind === 'rider') assert.ok(car.z > 0, 'motorcycles stay in their own road band');
          if (car.kind === 'truck') assert.ok(car.z < 0, 'trucks stay in their own road band');
          if (previous.get(car.id).phase === 'unloading' && car.phase === 'unloading') {
            assert.ok(Math.abs(car.x - previous.get(car.id).x + CRUISE_SPEED / 60) < 1e-7, `stopped truck ${car.id} fixed to road: dx=${car.x - previous.get(car.id).x} at ${frame}; near=${JSON.stringify([...state.cars.values()].filter(other => Math.abs(other.x - car.x) < 12).map(other => ({id:other.id,x:other.x,z:other.z,phase:other.phase,laneTo:other.laneTo})))}`);
            assert.equal(car.speed, 0);
            parkedFrames++;
          }
        }
      }
      if (state.mode === 'traffic') for (let a = 0; a < visible.length; a++) for (let b = a + 1; b < visible.length; b++) {
        assert.equal(collision(visible[a], visible[b]), false, `collision ${visible[a].id}/${visible[a].phase} with ${visible[b].id}/${visible[b].phase} at frame ${frame}`);
      }
    }
    assert.ok(state.stats.overtakes > 0);
    assert.ok(state.stats.unloads > 0 && parkedFrames > 0);
    assert.ok(state.stats.merges > 0);
    assert.ok(state.stats.arrivals > 0 && extraVisible);
    assert.ok(state.stats.departures > 0);
    assert.ok(state.stats.frontExits > 0, 'vehicles drive out through the front instead of piling up');
    assert.ok(state.stats.turns > 0, 'some motorcycles complete a real U-turn');
    assert.ok(phases.has('reverse'), 'turned motorcycles travel towards the rear');
    assert.ok(phases.has('passing') && phases.has('unloading') && phases.has('merging'));
    assert.deepEqual(slots, original, 'rank destinations never mutate');
    const frozen = structuredClone(state);
    advanceIdleTraffic(state, 0, true, random);
    assert.deepEqual(state, frozen, 'pause freezes actions and parcel progress');
    for (let frame = 0; frame < 1000; frame++) advanceIdleTraffic(state, 1 / 60, false, random);
    assert.equal(state.mode, 'rank');
    assert.equal(state.returning, false);
    for (const car of state.cars.values()) {
      if (car.ambient) assert.equal(car.alpha, 0);
      else { assert.equal(car.x, car.home); assert.equal(car.z, car.homeZ); assert.equal(car.alpha, 1); }
      assert.equal(car.yaw, 0);
      assert.equal(car.direction, 1);
    }
  });
}

test('entry spreads before merging lanes; interruptions start at the visible pose', () => {
  const state = createIdleTraffic(fleet(50)), random = seeded(6);
  for (let frame = 0; frame < 150; frame++) advanceIdleTraffic(state, 1 / 60, true, random);
  for (const car of state.cars.values()) if (!car.ambient) assert.equal(car.z, car.homeZ);
  for (let frame = 0; frame < 400; frame++) advanceIdleTraffic(state, 1 / 60, true, random);
  for (let frame = 0; frame < 20; frame++) advanceIdleTraffic(state, 1 / 60, false, random);
  const before = new Map([...state.cars.values()].map(car => [car.id, { x: car.x, z: car.z }]));
  advanceIdleTraffic(state, 1 / 60, true, random);
  for (const car of state.cars.values()) if (!car.ambient) {
    assert.ok(Math.abs(car.x - before.get(car.id).x) < 0.01);
    assert.equal(car.z, before.get(car.id).z);
  }
});

test('empty, single-vehicle, all-bike and all-truck cohorts remain finite and recover', () => {
  for (const items of [[], fleet(1), fleet(20, 'best', 'bikes'), fleet(20, 'best', 'trucks')]) {
    const state = createIdleTraffic(items), random = seeded(91);
    for (let i = 0; i < 3000; i++) advanceIdleTraffic(state, 0.1, true, random);
    for (let i = 0; i < 150; i++) advanceIdleTraffic(state, 0.1, false, random);
    for (const car of state.cars.values()) assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z));
    assert.equal(state.mode, 'rank');
  }
});

test('different random seeds preserve physical clearance during lane changes and arrivals', () => {
  for (const seed of [1, 7, 123, 90210]) {
    const state = createIdleTraffic(fleet(20)), random = seeded(seed);
    for (let i = 0; i < 9000; i++) {
      advanceIdleTraffic(state, 1 / 60, true, random);
      if (state.mode !== 'traffic') continue;
      const visible = [...state.cars.values()].filter(car => car.alpha > 0.1);
      for (let a = 0; a < visible.length; a++) for (let b = a + 1; b < visible.length; b++) {
        assert.equal(collision(visible[a], visible[b]), false, `seed ${seed}, frame ${i}, ${visible[a].id}/${visible[b].id}`);
      }
    }
  }
});

test('a U-turn follows an arc, rotates the rider, then travels backwards and restores its ranking pose', () => {
  const state = createIdleTraffic(fleet(10)), random = seeded(19);
  state.mode = 'traffic'; state.active = true;
  for (const car of state.cars.values()) { car.phase = 'absent'; car.alpha = 0; }
  const bike = state.cars.get('hub-0');
  Object.assign(bike, { phase: 'turning', alpha: 1, x: 0, z: state.lanes.rider, turnX: 0,
    turnZ: state.lanes.rider, turnRadius: (state.lanes.reverse-state.lanes.rider)/2,
    turnStart: 0, turnDuration: Math.PI*(state.lanes.reverse-state.lanes.rider)/2 });
  state.nextArrival = Infinity;
  for (let i=0;i<100;i++) advanceIdleTraffic(state,1/60,true,random);
  assert.ok(bike.yaw < 0 && bike.yaw > -Math.PI);
  const angle = -bike.yaw;
  assert.ok(Math.abs(bike.x + state.time*CRUISE_SPEED - bike.turnRadius*Math.sin(angle)) < 1e-8);
  for(let i=0;i<150;i++) advanceIdleTraffic(state,1/60,true,random);
  assert.equal(bike.direction,-1); assert.equal(bike.yaw,-Math.PI);
  assert.equal(bike.z,state.lanes.reverse);
  const x=bike.x;
  advanceIdleTraffic(state,1/60,true,random);
  assert.ok(bike.x < x-CRUISE_SPEED/60, 'travels against road direction, not just slower than traffic');
  for(let i=0;i<1000;i++) advanceIdleTraffic(state,1/60,false,random);
  assert.equal(bike.x,bike.home); assert.equal(bike.z,bike.homeZ);
  assert.equal(bike.yaw,0); assert.equal(bike.direction,1);
});

test('the original Top 1 has no speed or position privilege and can exit ahead', () => {
  const state = createIdleTraffic(fleet(10)), random = seeded(55);
  for (let i = 0; i < 400; i++) advanceIdleTraffic(state, 1 / 60, true, random);
  for (const car of state.cars.values()) { car.phase = 'absent'; car.alpha = 0; car.respawnAt = Infinity; }
  const top = state.cars.get('hub-0');
  Object.assign(top, { phase: 'cruise', alpha: 1, preferredSpeed: 4, speed: 4, nextAction: Infinity });
  state.nextArrival = Infinity;
  for (let i = 0; i < 1800 && top.phase !== 'absent'; i++) advanceIdleTraffic(state, 1 / 60, true, random);
  assert.ok(top.x > state.front);
  assert.equal(top.phase, 'absent');
  assert.equal(top.alpha, 0);
  assert.ok(state.stats.frontExits > 0);
});

test('traffic remains separated at low frame rates and the maximum playback step', () => {
  for (const dt of [0.1, 0.2]) {
    const state = createIdleTraffic(fleet(20)), random = seeded(72);
    for (let frame = 0; frame < 180 / dt; frame++) {
      advanceIdleTraffic(state, dt, true, random);
      if (state.mode !== 'traffic') continue;
      const visible = [...state.cars.values()].filter(car => car.alpha > 0.1);
      for (let a = 0; a < visible.length; a++) for (let b = a + 1; b < visible.length; b++) {
        assert.equal(collision(visible[a], visible[b]), false, `dt=${dt}, frame=${frame}, ${visible[a].id}/${visible[b].id}`);
      }
    }
    assert.ok(state.stats.frontExits > 0 && state.stats.turns > 0);
  }
});
