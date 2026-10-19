// Isolated Electron regression check. Fake only the OS key registry so this
// suite cannot steal shortcuts from the installed Cue. No keys or capture.
const { app, BrowserWindow, globalShortcut, ipcMain, systemPreferences, desktopCapturer } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { DEFAULTS } = require('../src/shortcuts');
const { ACTION_NAMES } = require('../src/shortcut-controller');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-shortcut-smoke-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({ onboarded: true, screenShareProtection: false }), { mode: 0o600 });
systemPreferences.getMediaAccessStatus = () => 'granted';
let permissionRequests = 0, captures = 0, providerCalls = 0;
systemPreferences.askForMediaAccess = () => { permissionRequests++; throw new Error('Shortcut changes must not request permissions'); };
desktopCapturer.getSources = () => { captures++; throw new Error('Shortcut checks must not capture the desktop'); };
require('../src/llm').createLLM = () => { providerCalls++; throw new Error('Shortcut checks must not contact providers'); };
const appLink = require('../vendor/app-link'), NativeAppLinkServer = appLink.AppLinkServer;
appLink.AppLinkServer = class extends NativeAppLinkServer { constructor(options) { super({ ...options, appId: `${options.appId}.shortcuts-${process.pid}` }); } };
const owned = new Map();
globalShortcut.register = (key, callback) => { assert.ok(!owned.has(key), 'no duplicate native registration'); owned.set(key, callback); return true; };
globalShortcut.unregister = key => { owned.delete(key); };
globalShortcut.unregisterAll = () => { owned.clear(); };
let menu, main;
const trayModule = require('../src/tray'), createTray = trayModule.createTrayController;
trayModule.createTrayController = options => createTray({ ...options, Menu: { buildFromTemplate(template) { menu = options.Menu.buildFromTemplate(template); return menu; } } });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await pause(20); }
  throw new Error('Timed out: ' + message);
}
function active() { return ACTION_NAMES.every(name => owned.has(DEFAULTS[name])); }
function released() { return owned.size === 1 && owned.has(DEFAULTS.hide); }
const timeout = setTimeout(() => fail(new Error('Shortcut regression timeout')), 30000);
function fail(error) { clearTimeout(timeout); console.error(error); app.exit(1); }
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
app.on('quit', () => assert.equal(owned.size, 0, 'shutdown releases recovery and action keys'));
app.on('browser-window-created', (_event, win) => {
  let visible = true, minimized = false;
  win.hide();
  win.showInactive = () => { visible = true; win.emit('show'); };
  win.show = win.showInactive; win.focus = () => {};
  win.hide = () => { visible = false; win.emit('hide'); };
  win.isVisible = () => visible; win.isMinimized = () => minimized;
  win.minimize = () => { minimized = true; win.emit('minimize'); };
  win.restore = () => { minimized = false; win.emit('restore'); };
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html') || main) return;
    main = win;
    const js = source => win.webContents.executeJavaScript(source, true);
    const click = selector => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
    try {
      await until(active, 'expanded visible Cue owns actions');
      assert.equal(await js('window.cue.settingsGet().then(s=>Object.values(s.apiKeys).every(key=>!key))'), true);
      // Fresh launches start in incognito, so enter visible mode explicitly
      // before exercising the tray menu that is only present in that mode.
      await js('window.cue.protectionSet(false)');
      const item = id => menu.getMenuItemById(id);
      item('visibility').click(); await until(released, 'tray Hide releases action keys');
      assert.equal(item('visibility').label, 'Show Cue');
      owned.get(DEFAULTS.hide)(); await until(active, 'recovery shortcut shows Cue and restores actions');
      await click('#hide-btn'); await until(released, 'toolbar collapse releases action keys');
      assert.equal(await js("document.querySelector('#panel-wrap').classList.contains('collapsed')"), true);
      owned.get(DEFAULTS.hide)(); await until(active, 'recovery expands the toolbar');
      win.minimize(); await until(released, 'minimize releases action keys');
      owned.get(DEFAULTS.hide)(); await until(active, 'recovery restores a minimized window');

      for (const selector of ['#settings-scrim', '#sessions-scrim', '#modes-scrim', '#onboard-scrim', '#consent-scrim']) {
        await js(`document.querySelector(${JSON.stringify(selector)}).classList.remove('hidden')`);
        await until(released, selector + ' pauses actions');
        assert.equal(await js(`(() => { const event = new KeyboardEvent('keydown', {key:'A',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}); document.dispatchEvent(event); return event.defaultPrevented; })()`), false, 'dialogs do not consume force-answer keys');
        await js(`document.querySelector(${JSON.stringify(selector)}).classList.add('hidden')`);
        await until(active, selector + ' resumes actions');
      }
      item('preferences').click(); await until(released, 'real preferences flow pauses actions');
      await click('#s-close'); await until(active, 'closing preferences resumes actions');

      win.minimize(); await until(released, 'minimize before tray show');
      assert.equal(item('visibility').label, 'Show Cue');
      item('visibility').click(); await until(active, 'tray Show restores a minimized window');
      if (process.platform === 'darwin') {
        app.hide(); await until(released, 'macOS application Hide releases keys');
        assert.equal(item('visibility').label, 'Show Cue');
        owned.get(DEFAULTS.hide)(); await until(active, 'recovery unhides the macOS application');
      }
      await js('window.cue.permissionsShow()');
      await until(released, 'native permission review pauses keys');
      const review = BrowserWindow.getAllWindows().find(window => window !== main);
      assert.ok(review);
      ipcMain.emit('window:shortcut-context', { sender: review.webContents }, { expanded: true, blocked: false });
      assert.ok(released(), 'permission review cannot reactivate shortcut bindings');
      review.close(); await until(active, 'closing native permission review resumes keys');
      ipcMain.emit('window:shortcut-context', { sender: win.webContents }, { expanded: 'no', blocked: 'yes' });
      assert.ok(active(), 'malformed shortcut IPC cannot alter registrations');
      ipcMain.emit('window:shortcut-context', { sender: {} }, { expanded: false, blocked: true });
      assert.ok(active(), 'foreign renderers cannot change shortcut state');

      win.webContents.emit('did-start-loading'); await until(released, 'reload immediately releases keys');
      const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.webContents.reload(); await loaded;
      await until(active, 'renderer reload restores keys only after UI context arrives');
      win.webContents.emit('render-process-gone', {}, { reason: 'synthetic-regression-check' });
      await until(released, 'renderer failure releases all actions');
      const recovered = new Promise(resolve => win.webContents.once('did-finish-load', resolve)); win.webContents.reload(); await recovered;
      await until(active, 'recovered renderer can restore actions');
      assert.equal(permissionRequests, 0); assert.equal(captures, 0); assert.equal(providerCalls, 0);
      clearTimeout(timeout);
      console.log('PASS: tray hide/show, collapse, minimize/restore, macOS hide, dialogs, malformed IPC, reload, renderer failure, recovery and shutdown.');
      app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main.js');
