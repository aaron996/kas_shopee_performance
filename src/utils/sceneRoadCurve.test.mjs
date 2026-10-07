import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleRoadFrame, getRoadCurveRadius, toRoadLocalVector } from './sceneRoadCurve.js';
import { hubPaintColor, hubRoofCode, truckPaintMask } from './sceneTruckPaint.js';

test('curve preserves lane separation, road centre and monotonic rank order', () => {
  for (const length of [36, 48, 120, 1400, 2400]) {
    assert.deepEqual(sampleRoadFrame(0, 0, length), { x:0,y:0,z:0,heading:-0,pitch:-0 });
    let previous = -Infinity;
    for (let x=-length/2;x<=length/2;x+=length/60) {
      const a=sampleRoadFrame(x,-1.8,length), b=sampleRoadFrame(x,0,length);
      assert.ok(b.x > previous); previous=b.x;
      assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-1.8)<1e-9);
      assert.ok(Object.values(a).every(Number.isFinite));
    }
    const radius=getRoadCurveRadius(length);
    const end=sampleRoadFrame(length/2,0,length);
    assert.ok(Math.abs(Math.hypot(end.x,end.z-radius)-radius)<1e-9);
    assert.ok(end.z>0 && end.y<0);
  }
});

test('truck frame follows the road tangent and its inverse keeps picking local', () => {
  for (const x of [-22,-7,0,11,22]) {
    const f=sampleRoadFrame(x,2.7,48);
    const before=sampleRoadFrame(x-1e-4,2.7,48), after=sampleRoadFrame(x+1e-4,2.7,48);
    const tangent=toRoadLocalVector(after.x-before.x,after.y-before.y,after.z-before.z,f.heading,f.pitch);
    assert.ok(tangent.x>0);
    assert.ok(Math.abs(tangent.y)<1e-9 && Math.abs(tangent.z)<1e-9);
    const cp=Math.cos(f.pitch), sp=Math.sin(f.pitch), cy=Math.cos(f.heading), sy=Math.sin(f.heading);
    const [lx,ly,lz]=[1.1,0.8,-0.4]; const along=cp*lx-sp*ly;
    const local=toRoadLocalVector(cy*along+sy*lz,sp*lx+cp*ly,-sy*along+cy*lz,f.heading,f.pitch);
    assert.ok(Math.abs(local.x-lx)<1e-9 && Math.abs(local.y-ly)<1e-9 && Math.abs(local.z-lz)<1e-9);
  }
});

test('paint identity survives ranking/filter changes and logo regions stay protected', () => {
  const ids=Array.from({length:30},(_,i)=>`HNO::Hub mẫu ${i}::Hub LM`);
  const colors=new Map(ids.map(id=>[id,hubPaintColor(id)]));
  const codes=new Map(ids.map(id=>[id,hubRoofCode(id)]));
  assert.equal(new Set(colors.values()).size,30);
  for (const id of ids.reverse().slice(0,20)) {
    assert.equal(hubPaintColor(id),colors.get(id));
    assert.equal(hubRoofCode(id),codes.get(id));
    assert.match(hubRoofCode(id), /^[0-9A-F]{4}$/);
  }
  assert.equal(truckPaintMask(-0.4,0.9),0);
  assert.equal(truckPaintMask(-0.4,1.53),0);
  assert.equal(truckPaintMask(1.1,0.9),0);
  assert.equal(truckPaintMask(-0.4,1.35),0);
  assert.equal(truckPaintMask(0.4,1.53),1);
  assert.equal(truckPaintMask(0.4,1.53,0),0);
});
