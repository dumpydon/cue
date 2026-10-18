// Tests permission review and the repair boundary with an isolated profile.
// Native permission requests, tccutil, relaunch and model calls are mocked.
const electron = require('electron');
const { app, BrowserWindow, desktopCapturer, systemPreferences } = electron;
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-permission-repair-smoke-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({ onboarded: true, screenShareProtection: false }), { mode: 0o600 });
Object.defineProperty(app, 'isPackaged', { value: true });
const recoveryLaunch = process.argv.includes('--cue-request-screen-after-repair');
let sourceRequests = 0, nativeChecks = 0, quitRequests = 0, relaunch = null;
let access = { microphone: 'granted', screen: 'denied' };
systemPreferences.getMediaAccessStatus = type => { nativeChecks++; return access[type]; };
systemPreferences.askForMediaAccess = () => { throw new Error('This test never requests microphone access'); };
desktopCapturer.getSources = async () => { sourceRequests++; return []; };
const resets = [], nativeExecFile = childProcess.execFile;
childProcess.execFile = (file, args, options, callback) => {
  if (file !== '/usr/bin/tccutil') return nativeExecFile(file, args, options, callback);
  resets.push([file, args]); queueMicrotask(() => callback(null, '', ''));
};
const nativeQuit = app.quit.bind(app), nativeRelaunch = app.relaunch.bind(app);
app.quit = () => { quitRequests++; };
app.relaunch = options => { relaunch = options; };
require('../src/macos-discovery').createMacDiscovery = () => ({ refresh: async () => ({ available: false, indexed: false }) });
require('../src/macos-signing').readSigningInfo = async () => ({ stable: true, kind: 'development', authority: 'Fixture Development', requirement: 'fixture' });
require('../src/model-catalog').createModelCatalog = () => ({ get: async () => ({ models: [], live: false }) });
require('../src/llm').createLLM = () => { throw new Error('No inference allowed'); };
const appLink = require('../vendor/app-link'), NativeAppLink = appLink.AppLinkServer;
appLink.AppLinkServer = class extends NativeAppLink { constructor(options) { super({ ...options, appId: options.appId + '.permission-repair-' + process.pid }); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) { for (let i = 0; i < 150; i++) { if (await predicate()) return; await pause(20); } throw new Error('Timed out: ' + label); }
const timeout = setTimeout(() => fail(new Error('Permission repair smoke timeout')), 20000);
function fail(error) { clearTimeout(timeout); console.error(error); app.exit(1); }
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
app.on('browser-window-created', (_event, main) => {
  main.hide(); main.show = () => {}; main.showInactive = () => {}; main.focus = () => {};
  main.webContents.setBackgroundThrottling(false);
  main.webContents.once('did-finish-load', async () => {
    if (!main.webContents.getURL().endsWith('/renderer/index.html')) return;
    try {
      const js = code => main.webContents.executeJavaScript(code, true);
      await until(() => js('!!window.CueMeetingModeUI && !!document.querySelector("#messages .ai-text")'), 'renderer ready');
      await js('window.CueMeetingModeUI.ready');
      if (!recoveryLaunch) await js('window.cue.permissionsShow()');
      await until(() => BrowserWindow.getAllWindows().length === 2, 'permission review');
      const review = BrowserWindow.getAllWindows().find(window => window !== main);
      if (review.webContents.isLoading()) await new Promise(resolve => review.webContents.once('did-finish-load', resolve));
      const rjs = code => review.webContents.executeJavaScript(code, true);
      await until(() => rjs('!document.querySelector("#repair-screen-wrap").classList.contains("hidden")'), 'scoped repair control');
      await pause(320);
      assert.equal(sourceRequests, recoveryLaunch ? 1 : 0, 'only an explicit repair relaunch requests screen access');
      assert.equal(main.isAlwaysOnTop(), false, 'overlay does not cover the system permission prompts');
      const checks = nativeChecks;
      for (let i = 0; i < 3; i++) await rjs('window.cue.permissionsCheck()');
      assert.ok(nativeChecks > checks); assert.equal(resets.length, 0); assert.equal(sourceRequests, recoveryLaunch ? 1 : 0);
      access.screen = 'granted'; review.emit('focus');
      await until(() => rjs('document.querySelector("#status-screen").textContent === "Granted"'), 'status updates on focus');
      assert.equal(await rjs('document.querySelector("#repair-screen-wrap").classList.contains("hidden")'), true);
      access.screen = 'denied'; review.emit('focus');
      await until(() => rjs('!document.querySelector("#repair-screen-wrap").classList.contains("hidden")'), 'review after revoked grant');
      const before = JSON.parse(fs.readFileSync(path.join(profile, 'cue-data.json'), 'utf8'));
      await rjs('document.querySelector("#repair-screen-btn").click()');
      await until(() => !!relaunch, 'explicit repair relaunch');
      assert.deepEqual(resets, [['/usr/bin/tccutil', ['reset', 'ScreenCapture', 'com.cue.overlay']]]);
      assert.equal(relaunch.execPath, app.getPath('exe'));
      assert.equal(relaunch.args.filter(arg => arg === '--cue-request-screen-after-repair').length, 1);
      assert.equal(quitRequests, 1);
      assert.equal(sourceRequests, recoveryLaunch ? 1 : 0, 'no repeated capture requests in the old process');
      const after = JSON.parse(fs.readFileSync(path.join(profile, 'cue-data.json'), 'utf8'));
      assert.deepEqual(after.apiKeys, before.apiKeys); assert.deepEqual(after.meetingModes, before.meetingModes);
      review.setSize(540, 560); await pause(80);
      await rjs('(()=>{const card=document.querySelector(".perm-card");card.scrollTop=card.scrollHeight;})()');
      await rjs('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const bounds = await rjs('(()=>{const r=document.querySelector("#continue-btn").getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};})()');
      assert.ok(bounds.top >= 0 && bounds.bottom <= bounds.height, JSON.stringify(bounds));
      const scroll = await rjs('(()=>{const card=document.querySelector(".perm-card");return {height:card.clientHeight,total:card.scrollHeight,top:card.scrollTop};})()');
      if (scroll.total > scroll.height + 1) assert.ok(scroll.top > 0, JSON.stringify(scroll));
      if (process.env.CUE_WINDOW_QA_DIR) {
        fs.mkdirSync(process.env.CUE_WINDOW_QA_DIR, { recursive: true });
        fs.writeFileSync(path.join(process.env.CUE_WINDOW_QA_DIR, 'permission-repair-review.png'), (await review.webContents.capturePage()).toPNG());
      }
      await rjs('document.querySelector("#continue-btn").click()');
      await until(() => review.isDestroyed(), 'return to Cue'); assert.equal(main.isAlwaysOnTop(), true);
      await js('window.cue.restart()');
      await until(() => quitRequests === 2, 'ordinary restart');
      assert.equal(relaunch.args.some(arg => arg.startsWith('--cue-request-screen-after-repair')), false, 'ordinary restarts cannot keep requesting the repaired permission');
      clearTimeout(timeout); childProcess.execFile = nativeExecFile; app.quit = nativeQuit; app.relaunch = nativeRelaunch;
      console.log('PASS: permission review refreshes without prompting, explicit repair is scoped, overlay yields to OS dialogs, data survives, and recovery launch requests once.');
      app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
