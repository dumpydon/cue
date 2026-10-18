const test = require('node:test');
const assert = require('node:assert/strict');
const { createShortcutController, ACTION_NAMES } = require('../src/shortcut-controller');
const { DEFAULTS } = require('../src/shortcuts');

function setup({ active = false, unavailable = [] } = {}) {
  const owned = new Map(), calls = [], warnings = [], errors = [], fired = [], state = {};
  const globalShortcut = {
    register(key, callback) { calls.push(['register', key]); if (unavailable.includes(key)) return false; owned.set(key, callback); return true; },
    unregister(key) { calls.push(['unregister', key]); owned.delete(key); }
  };
  const controller = createShortcutController({ globalShortcut, state, canRunActions: () => active,
    actions: Object.fromEntries([...ACTION_NAMES, 'hide'].map(name => [name, () => fired.push(name)])),
    onUnavailable: name => warnings.push(name), onError: (name, error) => errors.push([name, error]) });
  return { controller, state, owned, calls, warnings, errors, fired,
    active(value) { active = value; }, sync(value) { active = value; controller.sync(); } };
}

test('hidden startup reserves only the explicit show/hide recovery shortcut', () => {
  const h = setup(); h.controller.start();
  assert.deepEqual([...h.owned.keys()], [DEFAULTS.hide]);
  for (const name of ACTION_NAMES) assert.equal(h.state[name], false);
  h.owned.get(DEFAULTS.hide)(); assert.deepEqual(h.fired, ['hide']);
  assert.deepEqual(h.warnings, []);
});

test('hiding releases every action accelerator with the OS, including Command-Enter', () => {
  const h = setup({ active: true }); h.controller.start();
  for (const name of ACTION_NAMES) assert.equal(h.state[name], true);
  h.sync(false);
  assert.deepEqual([...h.owned.keys()], [DEFAULTS.hide]);
  assert.deepEqual(h.calls.filter(([kind]) => kind === 'unregister').map(([, key]) => key), ACTION_NAMES.map(name => DEFAULTS[name]));
});

test('showing reacquires actions without duplicating registrations or recovery bindings', () => {
  const h = setup({ active: true }); h.controller.start();
  const count = h.calls.length; h.controller.start(); h.controller.sync(); assert.equal(h.calls.length, count);
  h.sync(false); h.sync(false); h.sync(true); h.sync(true);
  for (const name of ACTION_NAMES) assert.equal(h.state[name], true);
  assert.equal(h.calls.filter(([kind, key]) => kind === 'register' && key === DEFAULTS.hide).length, 1);
});

test('a queued callback after the window becomes unavailable never runs an action', () => {
  const h = setup({ active: true }); h.controller.start();
  const queued = h.owned.get(DEFAULTS.say);
  h.active(false); queued(); assert.deepEqual(h.fired, []);
  h.sync(false); h.sync(true); h.owned.get(DEFAULTS.say)(); assert.deepEqual(h.fired, ['say']);
});

test('another app owning a key is respected and retried only after reactivation', () => {
  const h = setup({ active: true, unavailable: [DEFAULTS.say] }); h.controller.start();
  assert.equal(h.state.say, false); assert.deepEqual(h.warnings, ['say']);
  const count = h.calls.length; h.controller.sync(); assert.equal(h.calls.length, count);
  h.sync(false); assert.ok(!h.calls.some(([kind, key]) => kind === 'unregister' && key === DEFAULTS.say));
  h.sync(true); assert.deepEqual(h.warnings, ['say', 'say']);
});

test('disposing releases all owned keys and rejects callbacks already queued', () => {
  const h = setup({ active: true }); h.controller.start(); const queued = h.owned.get(DEFAULTS.hide);
  h.controller.dispose(); h.controller.dispose(); h.controller.start(); h.controller.sync(); queued();
  assert.equal(h.owned.size, 0); assert.deepEqual(h.fired, []);
  assert.ok(Object.values(h.state).every(value => value === false));
});
