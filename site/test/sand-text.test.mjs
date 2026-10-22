import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandText } from '../public/js/vendor/raisedhand-sand-text.js';

// A small DOM/canvas harness checks transition lifecycle without a browser dependency.
function harness(t, reduced = false) {
  const frames = new Map();
  const listeners = new Set();
  let frameId = 0, now = 0;
  const motion = {
    matches: reduced,
    addEventListener(_, callback) { listeners.add(callback); },
    removeEventListener(_, callback) { listeners.delete(callback); },
    change(value) { this.matches = value; listeners.forEach(callback => callback()); },
  };
  const context = {
    font: '', letterSpacing: '',
    measureText: text => ({ width: text.length * 8, actualBoundingBoxAscent: 28, actualBoundingBoxDescent: 6 }),
    scale() {}, setTransform() {}, clearRect() {}, fillText() {}, fillRect() {},
    getImageData: (_, __, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(255) }),
  };
  const element = tag => ({
    tagName: tag.toUpperCase(), textContent: '', dataset: {}, style: {}, offsetHeight: 44, offsetTop: 34,
    classList: { add() {} }, setAttribute() {},
    replaceChildren(...children) { this.children = children; },
    getContext: () => context,
  });
  const document = { hidden: false, createElement: element };
  const globals = {
    document, window: { devicePixelRatio: 1 },
    performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: () => ({
      fontStyle: 'normal', fontWeight: '600', fontSize: '44px', fontFamily: 'Geist',
      letterSpacing: '-1.3px', color: '#fff', getPropertyValue: () => '#9dbcff',
    }),
  };
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.entries(globals).forEach(([key, value]) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }));
  t.after(() => originals.forEach((descriptor, key) => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]));
  const price = element('b');
  price.textContent = '$19.99';
  const controller = createSandText(price, motion);
  return {
    controller, price, motion, frames, document, listeners,
    tick(time) { now = time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); },
  };
}

test('rapid billing changes cancel stale particles and settle on the latest price', t => {
  const h = harness(t);
  h.controller.set('$12.42');
  h.tick(120);
  h.controller.set('$19.99');
  h.tick(240);
  h.controller.set('$12.42');
  assert.equal(h.frames.size, 1, 'only the newest transition remains active');
  assert.equal(h.price.children[0].textContent, '$12.42');
  assert.equal(h.price.dataset.animating, 'true');
  h.tick(1200);
  assert.equal(h.frames.size, 0);
  assert.equal(h.price.dataset.animating, 'false');
  assert.equal(h.price.children[0].dataset.moving, undefined);
  assert.equal(h.price.children[2].style.opacity, '0');
  h.controller.destroy();
});

test('reduced motion shows the price immediately and interrupts an active transition', t => {
  const h = harness(t, true);
  h.controller.set('$12.42');
  assert.equal(h.price.children[0].textContent, '$12.42');
  assert.equal(h.frames.size, 0);
  h.motion.change(false);
  h.controller.set('$19.99');
  assert.equal(h.frames.size, 1);
  h.motion.change(true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.price.children[0].dataset.moving, undefined);
  assert.equal(h.price.children[2].style.opacity, '0');
  h.controller.destroy();
  assert.equal(h.listeners.size, 0);
});

test('hidden pages update price copy without starting an animation', t => {
  const h = harness(t);
  h.document.hidden = true;
  h.controller.set('$12.42');
  assert.equal(h.price.children[0].textContent, '$12.42');
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.controller.set('$19.99');
  assert.equal(h.frames.size, 1);
  h.controller.destroy();
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
});
