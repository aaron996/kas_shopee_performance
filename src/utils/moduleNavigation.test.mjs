import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_IDS } from '../modules/moduleIds.js';
import { MODULE_PATHS, moduleFromPath, createModuleNavigation } from './moduleNavigation.js';

function browserAt(path) {
  const entries = [new URL(path, 'https://dashboard.example')];
  let index = 0;
  const listeners = new Set();
  return {
    get location() { return entries[index]; },
    get length() { return entries.length; },
    history: {
      state: { existing: true },
      replaceState(state, _, url) { entries[index] = new URL(url, entries[index]); this.state = state; },
      pushState(state, _, url) { entries.splice(++index, entries.length, new URL(url, entries[index - 1])); this.state = state; },
    },
    addEventListener(type, listener) { assert.equal(type, 'popstate'); listeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, 'popstate'); listeners.delete(listener); },
    go(delta) { index += delta; listeners.forEach(listener => listener()); },
  };
}

test('each module has a unique path, with trailing slash support', () => {
  assert.deepEqual(Object.keys(MODULE_PATHS).sort(), [...MODULE_IDS].sort());
  assert.equal(new Set(Object.values(MODULE_PATHS)).size, MODULE_IDS.length);
  for (const id of MODULE_IDS) {
    assert.equal(moduleFromPath(MODULE_PATHS[id]), id);
    assert.equal(moduleFromPath(`${MODULE_PATHS[id]}/`), id);
  }
});

test('direct links override session tab; reload resolves the same module', () => {
  const browser = browserAt('/ranking?scope=SPE');
  const navigation = createModuleNavigation(browser, 'report1', () => {});
  assert.equal(navigation.initialTab, 'ranking');
  navigation.start();
  assert.equal(createModuleNavigation(browser, 'home', () => {}).initialTab, 'ranking');
  assert.equal(browser.length, 1);
});

test('legacy root restores session tab and replaces URL without a history entry', () => {
  const browser = browserAt('/?scope=SPB#auth-token');
  createModuleNavigation(browser, 'report5', () => {}).start();
  assert.equal(browser.location.pathname, '/lane-ca1');
  assert.equal(browser.location.search, '?scope=SPB');
  assert.equal(browser.location.hash, '#auth-token');
  assert.equal(browser.length, 1);
  assert.deepEqual(browser.history.state, { existing: true });
});

test('tab changes, Back and Forward follow URL without duplicate history', () => {
  const browser = browserAt('/overview?scope=SPE');
  let active;
  const navigation = createModuleNavigation(browser, 'home', tab => { active = tab; });
  const stop = navigation.start();
  navigation.navigate('report1');
  navigation.navigate('report1');
  navigation.navigate('cod-suspicion');
  assert.equal(browser.length, 3);
  assert.equal(active, 'cod-suspicion');
  browser.go(-1);
  assert.equal(active, 'report1');
  assert.equal(browser.location.pathname, '/performance');
  browser.go(-1);
  assert.equal(active, 'home');
  browser.go(1);
  assert.equal(active, 'report1');
  assert.equal(browser.location.search, '?scope=SPE');
  assert.equal(browser.length, 3);
  stop();
  browser.go(1);
  assert.equal(active, 'report1'); // listener was removed
});

test('unknown paths and invalid tab IDs fall back safely', () => {
  const browser = browserAt('/missing?scope=SPB');
  const navigation = createModuleNavigation(browser, 'ranking', () => {});
  assert.equal(navigation.initialTab, 'home');
  navigation.start();
  navigation.navigate('toString');
  navigation.navigate('missing');
  assert.equal(browser.location.pathname, '/overview');
  assert.equal(browser.length, 1);
});
