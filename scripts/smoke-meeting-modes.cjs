// Isolated end-to-end editor, persistence, file-import and prompt-routing checks.
// The provider and screen source are synthetic. No credentials or captures.
const { app, BrowserWindow, dialog, ipcMain, screen, systemPreferences, desktopCapturer } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const geometry = require('../src/window-geometry');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-meeting-modes-smoke-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
const settingsFile = path.join(profile, 'cue-data.json');
fs.writeFileSync(settingsFile, JSON.stringify({ onboarded: true, models: { openai: { fast: 'gpt-6-luna', smart: 'gpt-6.1-sol' } } }), { mode: 0o600 });
fs.writeFileSync(path.join(profile, 'meetings.json'), JSON.stringify([{ id: 'mode-fixture', title: 'Fixture meeting', startedAt: Date.now(), endedAt: null,
  transcript: [{ channel: 'them', text: 'Tell me about a time you led a project.', ts: Date.now() }], summary: '', actionItems: [], followUp: [] }]));
const documentPath = path.join(profile, 'role-notes.txt'), dropPath = path.join(profile, 'project.md');
fs.writeFileSync(documentPath, 'SYNTHETIC_ROLE_FILE: Built a garden app.'); fs.writeFileSync(dropPath, 'SYNTHETIC_DROP_FILE: Wrote the planting planner.');
systemPreferences.getMediaAccessStatus = () => 'denied';
systemPreferences.askForMediaAccess = () => { throw new Error('No permission request allowed'); };
desktopCapturer.getSources = () => { throw new Error('No desktop capture allowed'); };
require('../src/screen').captureScreenshot = async () => 'data:image/png;base64,c3ludGhldGlj';
require('../src/model-catalog').createModelCatalog = () => ({ get: async () => ({ models: [], live: false, message: '' }) });
const requests = [];
const contextEnd = '\nSYNTHETIC_CONTEXT_END_AFTER_32000';
const largeContext = 'SYNTHETIC_ACTIVE_CONTEXT: Speak about the garden app.\n'.repeat(1400).slice(0, 64000 - contextEnd.length) + contextEnd;
require('../src/llm').createLLM = settings => ({ ready: true, model: settings.models.openai[settings.smart ? 'smart' : 'fast'], provider: 'openai',
  async stream(request) { requests.push({ system: request.system, model: this.model }); request.onToken?.('Synthetic answer.'); return 'Synthetic answer.'; } });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [documentPath] });
const appLink = require('../vendor/app-link'), NativeAppLink = appLink.AppLinkServer;
appLink.AppLinkServer = class extends NativeAppLink { constructor(options) { super({ ...options, appId: options.appId + '.meeting-modes-' + process.pid }); } };
let interactionStarts = 0;
ipcMain.on('window:interaction-start', () => { interactionStarts++; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) { for (let i = 0; i < 180; i++) { if (await predicate()) return; await pause(20); } throw new Error('Timed out: ' + label); }
const timeout = setTimeout(() => fail(new Error('Meeting modes smoke timeout')), 45000);
function fail(error) { clearTimeout(timeout); console.error(error); app.exit(1); }
process.on('uncaughtException', fail); process.on('unhandledRejection', fail);
app.on('browser-window-created', (_event, win) => {
  win.hide(); win.showInactive = () => {}; win.show = () => {}; win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    try {
      const wc = win.webContents;
      const js = async code => { try { return await wc.executeJavaScript(code, true); } catch (error) { throw new Error(code.slice(0, 140) + '\n' + error.message); } };
      const click = selector => js('document.querySelector(' + JSON.stringify(selector) + ').click()');
      const field = (selector, value) => js(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      const mode = id => '#mode-list .mode-row[data-id="' + id + '"] .mode-select';
      const read = () => JSON.parse(fs.readFileSync(settingsFile, 'utf8')).meetingModes;
      async function screenshot(name) {
        const dir = process.env.CUE_WINDOW_QA_DIR; if (!dir) return; fs.mkdirSync(dir, { recursive: true });
        const b = win.getBounds(), image = await wc.capturePage({ x: 300, y: 0, width: b.width - 600, height: b.height });
        fs.writeFileSync(path.join(dir, name + '.png'), image.toPNG());
      }
      await until(() => js('!!window.CueMeetingModeUI && !!document.querySelector("#new-answer-thread")'), 'renderer initialization');
      await js('window.CueMeetingModeUI.ready');
      assert.equal(await js('window.cue.settingsGet().then(s=>Object.values(s.apiKeys).every(key=>!key))'), true);
      win.setBounds(geometry.restoreBounds({ windowWidth: 820, windowHeight: 780 }, screen.getPrimaryDisplay().workArea)); await pause(80);
      await js('window.CueMeetingModeUI.open()');
      assert.equal(await js('document.querySelectorAll(".mode-row").length'), 11);
      await click(mode('interview'));
      assert.equal(await js('document.querySelector("#mode-context").maxLength'), 64000);
      await field('#mode-title', 'InterviewA1'); await field('#mode-context', largeContext);
      await until(() => read().items.find(mode => mode.id === 'interview').title === 'InterviewA1', 'automatic title save');
      assert.equal(read().items.find(mode => mode.id === 'interview').context, largeContext, 'autosave retains the full 64,000 characters');
      assert.match(await js('document.querySelector("#mode-character-count").textContent'), /64,000 \/ 64,000 characters/);
      assert.equal(await js(`window.cue.meetingModesMutate('update', {id:'interview', title:'InterviewA1', context:${JSON.stringify(largeContext + 'x')}, expectedRevision:1}).then(()=>false,error=>error.message.includes('64,000 characters'))`), true, 'the main process rejects over-limit IPC input');
      assert.equal(read().activeId, 'general', 'editing is separate from activation');
      await click('#mode-activate'); await until(() => read().activeId === 'interview', 'Set Active');
      await until(() => js('!document.querySelector(".mode-row[data-id=\\"interview\\"] .mode-order-controls button").disabled'), 'reorder arrows re-enable after activation');
      await click('#mode-file-drop'); await until(() => read().items.find(mode => mode.id === 'interview').files.length === 1, 'file picker import');

      // Give the fixture a real disk-backed File, then exercise its normal
      // drop handler across the context-isolated preload bridge.
      await js('(()=>{const input=document.createElement("input");input.type="file";input.id="fixture-drop-file";input.hidden=true;document.body.append(input);})()');
      wc.debugger.attach('1.3');
      const { root } = await wc.debugger.sendCommand('DOM.getDocument');
      const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: '#fixture-drop-file' });
      await wc.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [dropPath] }); wc.debugger.detach();
      await js('(()=>{const data=new DataTransfer();data.items.add(document.querySelector("#fixture-drop-file").files[0]);document.querySelector("#mode-file-drop").dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data}));})()');
      await until(() => read().items.find(mode => mode.id === 'interview').files.length === 2, 'dropped file import');
      await click('#mode-file-drop'); await pause(100);
      assert.equal(read().items.find(mode => mode.id === 'interview').files.length, 2, 'reimport does not duplicate a document');
      await screenshot('modes-interview-editor');

      const before = read().items.map(mode => mode.id);
      await js('(()=>{const data=new DataTransfer(),grip=document.querySelector(".mode-row[data-id=\\"system-design\\"] .mode-drag-grip"),row=document.querySelector(".mode-row[data-id=\\"interview\\"]"),r=row.getBoundingClientRect();grip.dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:data}));row.dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:data,clientY:r.top+1}));row.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data,clientY:r.top+1}));})()');
      await until(() => read().items[1].id === 'system-design', 'drag to reorder');
      await until(() => js('!document.querySelector(".mode-row[data-id=\\"system-design\\"] .mode-order-controls button").disabled'), 'reorder arrows re-enable after saving an order');
      assert.equal(read().activeId, 'interview');
      assert.equal(interactionStarts, 0, 'sorting modes never starts a window drag');
      for (let index = 2; index <= 4; index++) {
        await js('document.querySelector(".mode-row[data-id=\\"system-design\\"] .mode-drag-grip").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",altKey:true,bubbles:true}))');
        await until(() => read().items[index].id === 'system-design', 'keyboard reorder step');
      }
      await until(() => JSON.stringify(read().items.map(mode => mode.id)) === JSON.stringify(before), 'keyboard reordering');

      await field('#mode-title', ''); await click('#modes-done'); await pause(80);
      assert.equal(await js('document.querySelector("#modes-scrim").classList.contains("hidden")'), false, 'invalid title keeps the editor and draft open');
      await field('#mode-title', 'InterviewA2');
      // A shortcut must flush a pending debounce before taking its prompt snapshot.
      const startRequests = requests.length;
      await js('window.cue.ask({mode:"ask",text:"Synthetic routing check"})');
      await until(() => requests.length > startRequests, 'prompt uses pending edits');
      assert.ok(requests.at(-1).system.includes('InterviewA2'));
      for (const action of ['say', 'answerThis', 'recap', 'assist', 'leetcode']) {
        await pause(45); const count = requests.length;
        await js('window.cue.ask({mode:' + JSON.stringify(action) + ',text:"Synthetic action check"})');
        await until(() => requests.length > count, 'context in ' + action);
        for (const text of ['SYNTHETIC_ACTIVE_CONTEXT', 'SYNTHETIC_ROLE_FILE', 'SYNTHETIC_DROP_FILE']) assert.ok(requests.at(-1).system.includes(text), action + ': ' + text);
        assert.ok(requests.at(-1).system.includes(largeContext), action + ': no truncation at the previous 32,000-character limit');
      }
      await pause(50); await js('window.cue.settingsSet({smart:true})');
      const count = requests.length; await js('window.cue.ask({mode:"ask",text:"Smart tier routing"})');
      await until(() => requests.length > count, 'smart tier'); assert.equal(requests.at(-1).model, 'gpt-6.1-sol');

      // Fail an actual disk write, keep the local draft, then retry it.
      await pause(50); fs.mkdirSync(settingsFile + '.tmp');
      await field('#mode-context', 'SYNTHETIC_RETRIED_CONTEXT');
      assert.equal(await js('window.CueMeetingModeUI.flush()'), false);
      assert.equal(await js('document.querySelector("#mode-context").value'), 'SYNTHETIC_RETRIED_CONTEXT');
      assert.ok(read().items.find(mode => mode.id === 'interview').context.includes('SYNTHETIC_ACTIVE_CONTEXT'));
      fs.rmdirSync(settingsFile + '.tmp'); await click('#mode-save-retry');
      await until(() => read().items.find(mode => mode.id === 'interview').context === 'SYNTHETIC_RETRIED_CONTEXT', 'save retry');

      await click('#mode-new'); await until(() => read().items.at(-1).title === 'Untitled Mode', 'new mode');
      const customId = read().items.at(-1).id;
      await field('#mode-title', '<img src=x onerror=window.UNSAFE=true>'); await field('#mode-context', 'Custom fixture context.');
      await js('window.CueMeetingModeUI.flush()');
      assert.equal(await js('!!document.querySelector("#mode-list img") || !!window.UNSAFE'), false, 'mode titles are text, not markup');
      await click('#mode-more'); await click('#mode-duplicate');
      await until(() => read().items.length === 13, 'duplicate mode');
      await click('#mode-more'); await click('#mode-delete'); await until(() => read().items.length === 12, 'delete mode');
      await click('#mode-undo-delete'); await until(() => read().items.length === 13, 'persistent undo');
      await click(mode('system-design')); await click('#mode-activate'); await until(() => read().activeId === 'system-design', 'switch active mode');
      await pause(50); const inactiveCount = requests.length;
      await js('window.cue.ask({mode:"ask",text:"Check mode isolation"})'); await until(() => requests.length > inactiveCount, 'new active context');
      assert.ok(requests.at(-1).system.includes('I am in a system design interview.'));
      assert.ok(!requests.at(-1).system.includes('SYNTHETIC_ROLE_FILE'));
      const loaded = new Promise(resolve => wc.once('did-finish-load', resolve)); wc.reload(); await loaded;
      await until(() => js('!!window.CueMeetingModeUI'), 'reload'); await js('window.CueMeetingModeUI.ready');
      await click('#modes-btn'); await until(() => js('!document.querySelector("#meeting-mode-menu").classList.contains("hidden")'), 'quick picker');
      assert.match(await js('document.querySelector("#modes-btn").title'), /System Design/);
      assert.equal(await js('document.querySelectorAll(".meeting-mode-option").length'), 13);
      assert.equal(await js('!!document.querySelector("#meeting-mode-menu img") || !!window.UNSAFE'), false);
      await screenshot('modes-quick-picker');
      await js('document.querySelector("#meeting-mode-menu").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
      await js('window.CueMeetingModeUI.open()'); await click(mode(customId));
      assert.equal(await js('document.querySelector("#mode-context").value'), 'Custom fixture context.');

      win.setBounds(geometry.restoreBounds({ windowWidth: 520, windowHeight: 360 }, screen.getPrimaryDisplay().workArea)); await pause(80);
      const metrics = await js('(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};return {height:innerHeight,width:innerWidth,dialog:rect("#meeting-modes"),done:rect("#modes-done"),active:rect("#mode-activate"),context:rect("#mode-context")};})()');
      for (const key of ['dialog','done','active']) assert.ok(metrics[key].top >= 0 && metrics[key].bottom <= metrics.height, JSON.stringify(metrics));
      assert.ok(metrics.context.right <= metrics.dialog.right);
      await screenshot('modes-minimum-window');
      const bounds = win.getBounds(); wc.emit('before-input-event', { preventDefault() {} }, { type:'keyDown',key:'-',meta:true }); await pause(80);
      assert.deepEqual(win.getBounds(), bounds, 'zoom does not resize the modes window');
      await click('#modes-done');
      const persisted = read(); assert.equal(persisted.activeId, 'system-design'); assert.equal(persisted.items.find(mode => mode.id === 'interview').files.length, 2);
      await js('window.CueMeetingModeUI.open()'); await click(mode(customId));
      await field('#mode-context', largeContext);
      app.once('will-quit', () => {
        assert.equal(read().items.find(mode => mode.id === customId).context, largeContext, 'quitting flushes all 64,000 characters of a pending autosave');
        console.log('PASS: 64,000-character context, over-limit IPC rejection, full-context prompt routing, autosave/retry/quit, activation, drag/keyboard ordering, real file picker/drop, tier routing, reload, safe titles and compact layout.');
      });
      clearTimeout(timeout);
      app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
