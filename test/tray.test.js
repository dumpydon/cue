const test = require('node:test');
const assert = require('node:assert/strict');
const { menuTemplate, createTrayController } = require('../src/tray');

test('menu labels follow listening / visibility / protection and every action is wired', () => {
  const calls = [];
  const actions = Object.fromEntries(['toggleListening', 'toggleVisibility', 'toggleProtection', 'openSessions', 'openPreferences', 'quit'].map(name => [name, () => calls.push(name)]));
  const menu = menuTemplate({ listening: false, visible: true, protection: { available: true, enabled: false } }, actions);
  assert.deepEqual(menu.filter(item => item.id).map(item => item.label), ['Start Listening', 'Hide Cue', 'Enable Invisibility', 'View History', 'Preferences…', 'Quit Cue']);
  for (const item of menu.filter(item => item.id)) item.click();
  assert.deepEqual(calls, Object.keys(actions));
  const changed = menuTemplate({ listening: true, visible: false, transitioning: true, protection: { available: false, enabled: true } }, actions);
  assert.equal(changed[0].label, 'Stop Listening'); assert.equal(changed[0].enabled, false);
  assert.equal(changed[1].label, 'Show Cue'); assert.equal(changed[2].enabled, false);
});

test('hidden mode destroys the native tray, visible mode restores exactly one template icon', async () => {
  const trays = [], templateCalls = [], errors = [];
  let hidden = true;
  class Tray {
    constructor(image) { this.image = image; trays.push(this); }
    isDestroyed() { return !!this.destroyed; }
    destroy() { this.destroyed = true; }
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.menu = value; }
  }
  const controller = createTrayController({ Tray, Menu: { buildFromTemplate: value => value },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false, setTemplateImage: value => templateCalls.push(value) }) },
    iconPath: 'template.png', platform: 'darwin',
    getState: () => ({ protection: { available: true, enabled: hidden }, visible: true }),
    actions: { quit: async () => { throw new Error('test failure'); } }, onError: error => errors.push(error.message)
  });
  controller.sync(); assert.equal(trays.length, 0);
  hidden = false; controller.sync(); controller.sync();
  assert.equal(trays.length, 1); assert.deepEqual(templateCalls, [true]); assert.equal(trays[0].tooltip, 'Cue');
  trays[0].menu.find(item => item.id === 'quit').click(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, ['test failure']);
  hidden = true; controller.sync(); assert.equal(trays[0].destroyed, true);
  hidden = false; controller.sync(); assert.equal(trays.length, 2);
  controller.destroy(); controller.sync(); assert.equal(trays[1].destroyed, true); assert.equal(trays.length, 2);
});
