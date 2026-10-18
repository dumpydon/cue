const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../renderer/window-interactions');

// Exercise gesture ownership and cancellation independently of the OS mouse.
function harness() {
  const document = new EventTarget();
  const window = new EventTarget();
  const html = new EventTarget();
  const calls = [];
  let captured = null;
  html.dataset = {};
  html.style = { setProperty() {}, removeProperty() {} };
  html.setPointerCapture = id => { captured = id; };
  html.hasPointerCapture = id => captured === id;
  html.releasePointerCapture = () => { captured = null; };
  document.documentElement = html;
  document.elementFromPoint = () => ({ closest: () => null });
  window.getComputedStyle = target => ({ userSelect: target.selectable ? 'text' : 'none', overflowY: 'visible', overflowX: 'visible' });
  const cue = {
    setIgnoreMouse: value => calls.push(['ignore', value]),
    windowInteractionStart: value => calls.push(['start', value]),
    windowInteractionEnd: () => calls.push(['end'])
  };
  const api = install({ cue, document, window });
  function target({ control = false, selectable = false, edge = null, surface = true } = {}) {
    return {
      selectable,
      closest: selector => selector === '.window-resize-handle' ? (edge ? { dataset: { resize: edge } } : null)
        : selector.startsWith('button,') ? (control ? {} : null) : surface ? {} : null,
      getBoundingClientRect: () => ({ right: 100, bottom: 100 }),
      scrollHeight: 0, clientHeight: 100, scrollWidth: 0, clientWidth: 100, parentElement: null
    };
  }
  function emit(type, props = {}, emitter = document) {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries({ button: 0, pointerId: 1, target: target(), ...props })) {
      Object.defineProperty(event, key, { value });
    }
    emitter.dispatchEvent(event);
    return event;
  }
  return { calls, api, emit, target, html, window, document };
}

test('background dragging holds pointer capture and blocks click-through until release', () => {
  const h = harness();
  assert.equal(h.emit('pointerdown').defaultPrevented, true);
  assert.equal(h.html.dataset.windowInteraction, 'drag');
  h.api.setIgnore(true);
  assert.deepEqual(h.calls, [['ignore', true], ['ignore', false], ['start', { kind: 'drag' }]]);
  h.emit('pointerup', { clientX: 0, clientY: 0 });
  assert.equal(h.html.dataset.windowInteraction, undefined);
  assert.deepEqual(h.calls.slice(-2), [['end'], ['ignore', true]]);
});

test('controls, selectable text, secondary clicks and transparent gaps never start a drag', () => {
  for (const props of [{ control: true }, { selectable: true }, { surface: false }]) {
    const h = harness();
    assert.equal(h.emit('pointerdown', { target: h.target(props) }).defaultPrevented, false);
    assert.equal(h.calls.some(call => call[0] === 'start'), false);
  }
  const h = harness();
  h.emit('pointerdown', { button: 2 });
  assert.equal(h.calls.some(call => call[0] === 'start'), false);
});

test('every resize handle starts a resize rather than moving the window', () => {
  for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const h = harness();
    h.emit('pointerdown', { target: h.target({ edge }) });
    assert.deepEqual(h.calls.at(-1), ['start', { kind: 'resize', edge }]);
    h.emit('pointerup');
    assert.equal(h.calls.at(-1)[0], 'end');
  }
});

test('release, cancel, lost capture, blur, Escape and mouse-up fallback end a gesture exactly once', () => {
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'keydown', 'mouseup']) {
    const h = harness();
    h.emit('pointerdown');
    const emitter = type === 'blur' ? h.window : type === 'lostpointercapture' ? h.html : h.document;
    h.emit(type, { key: 'Escape', buttons: 0 }, emitter);
    h.emit('pointerup');
    assert.equal(h.calls.filter(call => call[0] === 'end').length, 1, type);
    assert.equal(h.html.dataset.windowInteraction, undefined, type);
  }
});

test('queued forwarded mouse moves without button state cannot cancel a captured drag', () => {
  const h = harness();
  h.emit('pointerdown');
  h.emit('mousemove', { buttons: 0 });
  h.emit('pointermove', { buttons: 0 });
  assert.equal(h.calls.some(call => call[0] === 'end'), false);
  assert.equal(h.html.dataset.windowInteraction, 'drag');
  h.emit('pointerup');
  assert.equal(h.calls.at(-1)[0], 'end');
});

test('a second pointer cannot steal or end the active gesture', () => {
  const h = harness();
  h.emit('pointerdown');
  h.emit('pointerdown', { pointerId: 2 });
  h.emit('pointerup', { pointerId: 2 });
  assert.equal(h.calls.filter(call => call[0] === 'start').length, 1);
  assert.equal(h.calls.some(call => call[0] === 'end'), false);
  h.emit('pointerup');
  assert.equal(h.calls.at(-1)[0], 'end');
});
