// Real Electron integration check with synthetic sessions and no credentials,
// recording, desktop capture or provider calls. Never touches the installed app.
const electron = require('electron');
const { app, BrowserWindow, ipcMain, systemPreferences, desktopCapturer, screen } = electron;
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const geometry = require('../src/window-geometry');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-refinement-smoke-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
delete process.env.CUE_NO_PROTECT;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({ onboarded: true, screenShareProtection: false }), { mode: 0o600 });
fs.writeFileSync(path.join(profile, 'meetings.json'), JSON.stringify([{
  id: 'synthetic-session', title: 'Product planning', startedAt: 1800000000000, endedAt: 1800000300000,
  summary: 'Review the prototype and confirm next steps.', keyPoints: ['Keep the interface simple.'], decisions: ['Ship the local update.'],
  actionItems: ['Review the new icon.'], followUp: ['Check feedback.'],
  transcript: [{ channel: 'you', text: '<img src=x onerror="window.UNSAFE=true"> synthetic text', ts: 1800000001000 }, { channel: 'them', text: 'Let’s verify the window controls.', ts: 1800000002000 }]
}]));
systemPreferences.getMediaAccessStatus = () => 'granted';
systemPreferences.askForMediaAccess = () => { throw new Error('No permission request allowed'); };
desktopCapturer.getSources = () => { throw new Error('No desktop capture allowed'); };
const appLink = require('../vendor/app-link'), NativeAppLinkServer = appLink.AppLinkServer;
appLink.AppLinkServer = class extends NativeAppLinkServer { constructor(options) { super({ ...options, appId: `${options.appId}.refinement-${process.pid}` }); } };
const llm = require('../src/llm');
llm.createLLM = () => { throw new Error('No provider calls allowed'); };

let currentTray = null, menu = null;
const trayModule = require('../src/tray'), createTray = trayModule.createTrayController;
trayModule.createTrayController = options => {
  const NativeTray = options.Tray;
  return createTray({ ...options, Menu: { buildFromTemplate(template) { menu = options.Menu.buildFromTemplate(template); return menu; } }, Tray: class extends NativeTray {
    constructor(image) {
      super(image); currentTray = this;
      assert.equal(image.isTemplateImage(), process.platform === 'darwin');
      if (process.platform === 'darwin') {
        const pixels = image.toBitmap(); let painted = false;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) { painted = true; assert.equal(pixels[i] + pixels[i+1] + pixels[i+2], 0, 'template has no colored pixels'); }
        assert.ok(painted);
      }
    }
  } });
};

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await pause(20); }
  throw new Error('Timed out: ' + label);
}
const timeout = setTimeout(() => fail(new Error('Refinement smoke timeout')), 30000);
function fail(error) { clearTimeout(timeout); console.error(error); app.exit(1); }
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
app.on('browser-window-created', (_event, win) => {
  let visible = true;
  win.hide();
  win.showInactive = () => {};
  win.show = () => { visible = true; win.emit('show'); };
  win.hide = () => { visible = false; win.emit('hide'); };
  win.isVisible = () => visible;
  win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    try {
      const wc = win.webContents, js = code => wc.executeJavaScript(code, true);
      await until(() => js('!!window.CueListening && !!document.querySelector("#messages .ai-text")'), 'renderer initialization');
      assert.equal(await js('window.cue.settingsGet().then(s=>Object.values(s.apiKeys).every(key=>!key))'), true);
      const area = screen.getPrimaryDisplay().workArea;
      win.setBounds(geometry.restoreBounds({ windowWidth: 650, windowHeight: 560 }, area)); await pause(80);
      const initial = win.getBounds();
      const qa = process.env.CUE_WINDOW_QA_DIR;
      async function screenshot(name) {
        if (!qa) return;
        fs.mkdirSync(qa, { recursive: true });
        const b = win.getBounds(), image = await wc.capturePage({x:300,y:0,width:b.width-600,height:b.height});
        fs.writeFileSync(path.join(qa, name + '.png'), image.toPNG());
      }
      async function metrics() {
        const zoom = wc.getZoomFactor();
        const rect = await js(`(() => {const a=document.querySelector('#app').getBoundingClientRect(),p=document.querySelector('#panel').getBoundingClientRect();return { appWidth:a.width, panelWidth:p.width, panelLeft:p.left };})()`);
        return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * zoom]));
      }
      const original = await metrics();
      for (const key of ['-', '-', '-', '+', '=', '0', '+']) {
        let prevented = false;
        wc.emit('before-input-event', {preventDefault(){prevented=true;}}, {type:'keyDown',key,meta:true});
        assert.ok(prevented); await pause(80);
        assert.deepEqual(win.getBounds(), initial, 'zoom does not move or resize native window');
        const next = await metrics();
        for (const dimension of ['appWidth','panelWidth','panelLeft']) assert.ok(Math.abs(original[dimension] - next[dimension]) < 1.5, JSON.stringify({key, original, next}));
      }
      await screenshot('zoom-in');
      wc.emit('before-input-event', {preventDefault(){}}, {type:'keyDown',key:'0',meta:true}); await pause(80);
      assert.equal(await js("document.querySelector('.resize-grip').textContent.trim()"), '');
      assert.equal(await js("document.querySelector('#logo-btn img').complete && document.querySelector('#logo-btn img').naturalWidth > 0"), true);
      await screenshot('updated-cue');

      assert.ok(currentTray && !currentTray.isDestroyed());
      const item = id => menu.getMenuItemById(id);
      item('visibility').click(); assert.equal(win.isVisible(), false); assert.equal(item('visibility').label, 'Show Cue');
      item('visibility').click(); assert.equal(win.isVisible(), true); assert.equal(item('visibility').label, 'Hide Cue');
      item('preferences').click();
      await until(() => js("!document.querySelector('#settings-scrim').classList.contains('hidden')"), 'tray preferences');
      await js("document.querySelector('#s-close').click()"); await pause(100);
      item('sessions').click();
      await until(() => js("document.querySelectorAll('.session-card').length===1"), 'saved session list');
      await screenshot('sessions-list');
      await js("document.querySelector('.session-card').click()");
      await until(() => js("document.querySelectorAll('.session-turn').length===2"), 'session detail');
      assert.equal(await js("document.querySelector('#sessions-content img')===null && !window.UNSAFE"), true, 'session text cannot inject markup');
      assert.match(await js("document.querySelector('#sessions-content').textContent"), /synthetic text/);
      await screenshot('session-detail');
      await js("document.querySelector('#sessions-close').click()");
      ipcMain.removeHandler('sessions:list'); ipcMain.handle('sessions:list', () => []);
      item('sessions').click();
      await until(() => js("document.querySelector('#sessions-content').textContent.includes('No saved sessions')"), 'empty session state');
      await js("document.querySelector('#sessions-close').click()");
      await js('window.CueListening.toggle=async()=>{window.menuListeningCalls=(window.menuListeningCalls||0)+1; return false;}; void 0;');
      item('listening').click();
      await until(() => js('window.menuListeningCalls===1'), 'tray listening uses toolbar flow');
      const visibleTray = currentTray;
      item('invisibility').click();
      await until(() => visibleTray.isDestroyed(), 'hidden mode removes native tray');
      assert.equal(await js('window.cue.protectionGet().then(s=>s.enabled)'), true);
      await js('window.cue.protectionSet(false)');
      assert.ok(currentTray !== visibleTray && !currentTray.isDestroyed(), 'visible mode restores tray');
      assert.equal(await js("document.querySelector('#protection-btn').dataset.icon"), 'eye');
      assert.equal(app.getPath('userData'), profile);
      clearTimeout(timeout);
      console.log('PASS: native tray, all menu actions, monochrome icon, sessions, safe text rendering, zoom geometry and icon-only resize.');
      item('quit').click();
    } catch (error) { fail(error); }
  });
});
require('../main.js');
