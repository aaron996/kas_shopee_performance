import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { trafficInView, labelAnchorInView } from './sceneVisibility.js';
import { createIdleTraffic, advanceIdleTraffic } from './sceneIdle.js';

test('offscreen and behind-camera label anchors disappear instead of pinning to screen edges', () => {
  assert.equal(labelAnchorInView(0,0,0),true);
  for (const p of [[1.1,0,0],[-1.1,0,0],[0,1.1,0],[0,0,2],[0,0,-2]]) assert.equal(labelAnchorInView(...p),false);
});

test('traffic uses padded real camera frustum for recycling eligibility', () => {
  const camera = new THREE.PerspectiveCamera(52,1.8,.5,200);
  camera.position.set(0,8,16);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const state={cameraView:{roadLength:360,planes:frustum.planes.map(p=>[p.normal.x,p.normal.y,p.normal.z,p.constant])}};
  assert.equal(trafficInView(state,0,0),true);
  assert.equal(trafficInView(state,100,0),false);
});

test('a visible traffic actor crosses simulation boundary without fading or disappearing', () => {
  const state=createIdleTraffic([{id:'a',x:0,z:0,item:{hubType:'BC'}}]);
  state.mode='traffic';state.active=true;state.nextArrival=Infinity;state.police.nextAt=Infinity;
  state.cameraView={roadLength:360,planes:[[0,0,0,1]]}; // a view containing the whole test path
  const c=state.cars.get('a');
  Object.assign(c,{x:state.front-.1,z:state.lanes.rider,roadLane:state.lanes.rider,phase:'cruise',speed:4,preferredSpeed:4,nextAction:Infinity});
  for(let i=0;i<20;i++)advanceIdleTraffic(state,.1,true,()=>.8);
  assert.ok(c.x>state.front);assert.equal(c.alpha,1);assert.equal(c.phase,'cruise');
  state.cameraView.planes=[[0,0,0,-100]];
  advanceIdleTraffic(state,.1,true,()=>.8);
  assert.equal(c.alpha,0);assert.equal(c.phase,'absent');
});

test('respawn waits while the entrance is in view',()=>{
  const state=createIdleTraffic([{id:'a',x:0,z:0,item:{hubType:'BC'}}]);
  state.mode='traffic';state.active=true;state.nextArrival=Infinity;state.police.nextAt=Infinity;
  state.cameraView={roadLength:360,planes:[[0,0,0,1]]};
  const c=state.cars.get('a');Object.assign(c,{phase:'absent',alpha:0,respawnAt:0});
  advanceIdleTraffic(state,.1,true,()=>.8);assert.equal(c.phase,'absent');
  state.cameraView.planes=[[0,0,0,-100]];
  advanceIdleTraffic(state,.1,true,()=>.8);assert.equal(c.phase,'cruise');assert.equal(c.alpha,1);
});
