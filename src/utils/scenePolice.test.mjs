import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleTraffic, advanceIdleTraffic, createTrafficExtras } from './sceneIdle.js';
import { CRUISE_SPEED } from './sceneDriving.js';

for (const hubType of ['BC', 'GXT']) test(`police completes chase, roadside check and release for ${hubType}`, () => {
  const items = [{ id: 'hub', x: 0, z: 0, item: { hubType } }];
  const original = structuredClone(items), state = createIdleTraffic(items);
  const phases = new Set(); let previous, parked = 0;
  for (let i=0; i<3000; i++) {
    advanceIdleTraffic(state,.05,true,()=>.8);
    phases.add(state.police.phase);
    const c=state.cars.get('hub');
    if (state.police.phase==='check') {
      if (previous?.phase==='check') {
        assert.ok(Math.abs(c.x-previous.x+.05*CRUISE_SPEED)<1e-7);
        assert.equal(c.speed,0);
      }
      parked++;
    }
    previous={phase:state.police.phase,x:c.x};
    if (state.police.checks && state.police.phase==='waiting') break;
  }
  for (const p of ['chase','pull','check','release','depart']) assert.ok(phases.has(p),`missing ${p}: ${[...phases]}`);
  assert.ok(parked>=330);
  assert.equal(state.police.checks,1);
  assert.deepEqual(items,original);
  for (let i=0;i<300;i++) advanceIdleTraffic(state,.05,false,()=>.8);
  assert.equal(state.mode,'rank'); assert.equal(state.police.alpha,0);
  assert.equal(state.cars.get('hub').x,0); assert.equal(state.cars.get('hub').z,0);
});

test('active police actor does not overlap traffic across multiple random schedules',()=>{
  for (let seed=1;seed<=5;seed++) {
    let s=seed;const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
    const items=Array.from({length:10},(_,i)=>({id:`h-${i}`,x:-i*7,z:0,item:{hubType:i%2?'BC':'GXT'}}));
    const state=createIdleTraffic([...items,...createTrafficExtras(items)]);
    for(let step=0;step<3600;step++) {
      advanceIdleTraffic(state,.05,true,random);
      const p=state.police;
      if(p.alpha<.1)continue;
      for(const c of state.cars.values()) {
        if(c.alpha<.1)continue;
        const overlap=Math.abs(p.x-c.x)<(c.kind==='truck'?2.85:2.42)&&Math.abs(p.z-c.z)<(c.kind==='truck'?1.5:1);
        assert.ok(!overlap,`seed ${seed}, step ${step}: ${p.phase} vs ${c.id}/${c.phase}, gap ${p.x-c.x}, lane ${p.z-c.z}`);
      }
    }
  }
});

test('zero simulation step freezes the police and idle cancellation releases its target',()=>{
  const state=createIdleTraffic([{id:'a',x:0,z:0,item:{hubType:'BC'}}]);
  for(let i=0;i<800 && state.police.phase!=='check';i++) advanceIdleTraffic(state,.05,true,()=>.8);
  assert.equal(state.police.phase,'check');
  const before=structuredClone(state.police);
  advanceIdleTraffic(state,0,true);assert.deepEqual(state.police,before);
  advanceIdleTraffic(state,.05,false);assert.equal(state.police.alpha,0);assert.equal(state.police.targetId,null);
  assert.equal(state.cars.get('a').phase,'returning');
  assert.equal(state.cars.get('a').policeStop,false);
});
