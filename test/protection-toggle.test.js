const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../renderer/protection-toggle');

function setup({ reject = false, available = true, delayed = false } = {}) {
  const button = new EventTarget();
  const classes = new Set();
  const attributes = {};
  button.classList = { toggle: (key, value) => value ? classes.add(key) : classes.delete(key) };
  button.dataset = {};
  button.setAttribute = (key, value) => { attributes[key] = value; };
  let changed, resolveSet;
  const requests = [], errors = [];
  const initial = { available, enabled: false, bestEffort: true, reason: available ? '' : 'Unsupported session' };
  const cue = {
    on: (_channel, callback) => { changed = callback; },
    protectionGet: async () => initial,
    protectionSet: async enabled => {
      requests.push(enabled);
      if (reject) throw new Error('Could not save');
      if (delayed) await new Promise(resolve => { resolveSet = resolve; });
      return { ...initial, enabled };
    }
  };
  const ui = install({ button, cue, icon: name => name, onError: message => errors.push(message) });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return { button, attributes, requests, errors, ui, tick, changed: state => changed(state), resolve: () => resolveSet() };
}

test('eye changes to incognito when enabled and back to eye when disabled', async () => {
  const h = setup();
  assert.equal(h.button.disabled, true);
  await h.ui.ready;
  assert.equal(h.button.dataset.icon, 'eye');
  assert.equal(h.attributes['aria-pressed'], 'false');
  h.button.dispatchEvent(new Event('click')); await h.tick();
  assert.equal(h.button.dataset.icon, 'hat-glasses');
  assert.equal(h.attributes['aria-pressed'], 'true');
  assert.match(h.button.title, /Hidden mode: on/);
  assert.match(h.button.title, /Best effort on macOS/);
  h.button.dispatchEvent(new Event('click')); await h.tick();
  assert.equal(h.button.dataset.icon, 'eye');
  assert.deepEqual(h.requests, [true, false]);
});

test('rapid clicks cannot issue overlapping requests', async () => {
  const h = setup({ delayed: true }); await h.ui.ready;
  h.button.dispatchEvent(new Event('click'));
  h.button.dispatchEvent(new Event('click'));
  assert.equal(h.button.disabled, true);
  assert.deepEqual(h.requests, [true]);
  h.resolve(); await h.tick();
  assert.equal(h.button.disabled, false);
  assert.equal(h.button.dataset.icon, 'hat-glasses');
});

test('a failed native or save request keeps the previous icon and reports the error', async () => {
  const h = setup({ reject: true }); await h.ui.ready;
  h.button.dispatchEvent(new Event('click')); await h.tick();
  assert.equal(h.button.dataset.icon, 'eye');
  assert.equal(h.attributes['aria-pressed'], 'false');
  assert.deepEqual(h.errors, ['Could not save']);
  assert.equal(h.button.disabled, false);
});

test('unavailable protection is disabled with an explanatory tooltip', async () => {
  const h = setup({ available: false }); await h.ui.ready;
  h.button.dispatchEvent(new Event('click')); await h.tick();
  assert.equal(h.button.disabled, true);
  assert.equal(h.button.dataset.icon, 'eye');
  assert.equal(h.button.title, 'Unsupported session');
  assert.deepEqual(h.requests, []);
});
