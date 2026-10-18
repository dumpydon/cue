const test = require('node:test');
const assert = require('node:assert/strict');
const { protectionCapability, createProtectionController } = require('../src/content-protection');

function windowStub() {
  return { value: false, isDestroyed: () => false, setContentProtection(value) { this.value = value; } };
}

function setup({ saveError = false, capability = protectionCapability({ platform: 'darwin' }) } = {}) {
  let saved = true;
  const windows = [windowStub(), windowStub()];
  const controller = createProtectionController({
    capability, getWindows: () => windows,
    readPreference: () => saved,
    writePreference: value => { if (saveError) throw new Error('disk full'); saved = value; }
  });
  for (const window of windows) controller.applyToWindow(window);
  return { controller, windows, saved: () => saved };
}

test('hidden mode applies to every Cue window and the choice survives new windows', () => {
  const h = setup();
  assert.equal(h.controller.state().enabled, true);
  assert.ok(h.windows.every(window => window.value));
  assert.equal(h.controller.setEnabled(false).enabled, false);
  assert.equal(h.saved(), false);
  assert.ok(h.windows.every(window => !window.value));
  const reopened = windowStub();
  h.controller.applyToWindow(reopened);
  assert.equal(reopened.value, false);
  h.controller.setEnabled(true);
  assert.equal(h.saved(), true);
});

test('a save failure restores the actual native flags and leaves state unchanged', () => {
  const h = setup({ saveError: true });
  assert.throws(() => h.controller.setEnabled(false), /disk full/);
  assert.equal(h.controller.state().enabled, true);
  assert.equal(h.saved(), true);
  assert.ok(h.windows.every(window => window.value));
});

test('a native failure halfway through applying rolls back all other windows', () => {
  const h = setup();
  h.windows[1].setContentProtection = value => { if (!value) throw new Error('native failure'); };
  assert.throws(() => h.controller.setEnabled(false), /native failure/);
  assert.equal(h.windows[0].value, true);
  assert.equal(h.controller.state().enabled, true);
  assert.equal(h.saved(), true);
});

test('unsupported and debug sessions never claim that protection is enabled', () => {
  for (const options of [
    { platform: 'linux' }, { platform: 'darwin', forceVisible: true },
    { platform: 'win32', windowsSupported: false }, { platform: 'win32', localConsole: false }
  ]) {
    const h = setup({ capability: protectionCapability(options) });
    assert.equal(h.controller.state().available, false);
    assert.equal(h.controller.state().enabled, false);
    assert.throws(() => h.controller.setEnabled(true));
    assert.ok(h.windows.every(window => !window.value));
  }
});

test('only explicit boolean values are accepted', () => {
  const h = setup();
  for (const value of [undefined, null, 'false', 0, {}]) assert.throws(() => h.controller.setEnabled(value));
  assert.equal(h.controller.state().enabled, true);
});
