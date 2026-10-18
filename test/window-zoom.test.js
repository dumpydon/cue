const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { installWindowZoom, LEVELS } = require('../src/window-zoom');

function setup() {
  const contents = new EventEmitter(), calls = [], published = [];
  contents.setZoomFactor = value => calls.push(value);
  const window = { webContents: contents, setBounds() { throw new Error('Zoom must not resize or move the window'); } };
  const api = installWindowZoom({ window, onChange: value => published.push(value) });
  function key(key, extra = {}) {
    let prevented = false;
    contents.emit('before-input-event', { preventDefault() { prevented = true; } }, { type: 'keyDown', meta: true, key, ...extra });
    return prevented;
  }
  return { api, contents, calls, published, key };
}

test('Cmd/Ctrl minus, plus, equals and zero change only content zoom once', () => {
  const h = setup();
  assert.equal(h.key('-'), true); assert.equal(h.api.state().factor, .9);
  assert.equal(h.key('+', { shift: true }), true); assert.equal(h.api.state().factor, 1);
  assert.equal(h.key('=', { meta: false, control: true }), true); assert.equal(h.api.state().factor, 1.1);
  assert.equal(h.key('0'), true); assert.equal(h.api.state().factor, 1);
  assert.deepEqual(h.calls, [.9, 1, 1.1, 1]);
});

test('normal typing, Alt combinations, composition and key-up are unaffected', () => {
  const h = setup();
  for (const extra of [{ meta: false }, { alt: true }, { isComposing: true }, { type: 'keyUp' }]) assert.equal(h.key('-', extra), false);
  assert.equal(h.key(','), false); assert.deepEqual(h.calls, []);
});

test('zoom stays bounded and reload publishes the same scale', () => {
  const h = setup();
  for (let i = 0; i < 30; i++) h.api.change('out');
  assert.equal(h.api.state().factor, Math.min(...LEVELS));
  for (let i = 0; i < 30; i++) h.api.change('in');
  assert.equal(h.api.state().factor, Math.max(...LEVELS));
  h.contents.emit('did-finish-load');
  assert.deepEqual(h.published.at(-1), { factor: 1.5 });
});
