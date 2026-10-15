import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldLayout } from './sceneWorldLayout.js';

test('both cities mix dark and occupied rooms, varied shop fixtures and stable lighting across quality tiers', () => {
  for (const city of ['hcm', 'hanoi']) {
    const full = createWorldLayout(284, 11, city), compact = createWorldLayout(284, 11, city, true);
    const identity = part => [part.anchor, part.streetSide, part.x, part.y, part.z];
    const panes = layout => layout.batches.shopGlass.filter(part => part.nightLight);
    assert.deepEqual(panes(full).map(part => [identity(part), part.nightLight]), panes(compact).map(part => [identity(part), part.nightLight]));
    for (const layout of [full, compact]) {
      const rooms = panes(layout), lit = rooms.filter(part => part.nightLight.strength > 0);
      assert.ok(lit.length / rooms.length > 0.3 && lit.length / rooms.length < 0.8);
      assert.ok(new Set(lit.map(part => part.nightLight.color)).size >= 4);
      assert.ok(new Set(layout.batches.cityLamp.map(part => part.fixtureType)).size >= 3);
      for (const side of [-1, 1]) {
        const ground = rooms.filter(part => part.streetSide === side && part.y === 1.15);
        assert.ok(ground.some(part => !part.nightLight.strength) && ground.some(part => part.nightLight.strength > 0));
      }
      const darkAddresses = new Set(rooms.filter(part => part.nightLight.strength === 0).map(part => `${part.anchor}:${part.streetSide}`));
      assert.ok(darkAddresses.size > 10);
      assert.ok(Object.values(layout.batches).flat().length < 6500);
    }
  }
});
