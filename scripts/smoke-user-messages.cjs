// Run with Electron. Real renderer, input, IPC and selection; synthetic model
// and disposable profile. No physical capture, credentials or clipboard writes.
const { app, clipboard, desktopCapturer, globalShortcut, ipcMain, Menu, screen, session, systemPreferences } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const geometry = require('../src/window-geometry');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-user-messages-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({
  onboarded: true, provider: 'openai', apiKeys: { openai: 'synthetic-only' }, screenShareProtection: false
}), { mode: 0o600 });
systemPreferences.getMediaAccessStatus = () => 'denied';
systemPreferences.askForMediaAccess = () => { throw Error('No physical capture permission allowed'); };
desktopCapturer.getSources = () => { throw Error('No physical screen capture allowed'); };
globalShortcut.register = () => false; globalShortcut.unregister = () => {}; globalShortcut.unregisterAll = () => {};
require('../src/model-catalog').createModelCatalog = () => ({ get: async () => ({ models: [], live: false }) });
const requests = [], copies = [];
let rejectCopy = false, release;
clipboard.writeText = text => { if (rejectCopy) throw Error('Synthetic clipboard failure'); copies.push(text); };
require('../src/llm').createLLM = () => ({ ready: true, provider: 'openai', model: 'synthetic', async stream(request) {
  requests.push(request);
  await new Promise(resolve => { release = resolve; });
  const answer = 'Time is **O(n log n)**; the sort dominates.\n\nSpace is **O(n)**.';
  request.onToken?.(answer);
  return answer;
} });
const appLink = require('../vendor/app-link'), BaseServer = appLink.AppLinkServer;
appLink.AppLinkServer = class extends BaseServer { constructor(options) { super({ ...options, appId: options.appId + '.user-messages-' + process.pid }); } };
const contextMenus = [], buildMenu = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = template => {
  const menu = buildMenu(template);
  if (template.length === 1 && template[0].role === 'copy') menu.popup = () => contextMenus.push(template);
  return menu;
};
let gestureStarts = 0;
ipcMain.on('window:interaction-start', () => { gestureStarts++; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 250; i++) { if (await check()) return; await pause(20); } throw Error('Timed out: ' + label); }
const timeout = setTimeout(() => fail(Error('User message regression timed out')), 60000);
function fail(error) { clearTimeout(timeout); console.error(error); app.exit(1); }
process.on('unhandledRejection', fail); process.on('uncaughtException', fail);

const prompt = '    class Solution {\npublic:\n\tlong long maximizeSum(vector<int>& nums, int k) {\n' +
  '        long long sum = 0;\n        vector<long long> gains;\n\n' +
  '        for (int num : nums) {\n            sum += num;\n\n' +
  '            string digits = to_string(num);\n            sort(digits.begin(), digits.end(), greater<char>());\n' +
  '            long long best = stoll(digits);\n            gains.push_back(best - num);\n        }\n\n' +
  '        sort(gains.begin(), gains.end(), greater<long long>());\n\n' +
  '        for (int i = 0; i < k; ++i) {\n            sum += gains[i];\n        }\n\n' +
  '        return sum;\n    }\n};\n\nWhat is the time complexity of this?  ';

app.on('browser-window-created', (_event, win) => {
  win.hide(); win.show = () => {}; win.showInactive = () => {}; win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    const wc = win.webContents, js = source => wc.executeJavaScript(source, true);
    async function screenshot(name) {
      const directory = process.env.CUE_WINDOW_QA_DIR; if (!directory) return;
      await js("document.querySelectorAll('.user-bubble').forEach(b=>b.getAnimations().forEach(a=>a.finish()))");
      await pause(100); // Capture the completed entry state even in a hidden test window.
      fs.mkdirSync(directory, { recursive: true });
      const bounds = win.getBounds();
      const image = await wc.capturePage({ x:300, y:0, width:bounds.width-600, height:bounds.height });
      fs.writeFileSync(path.join(directory, name + '.png'), image.toPNG());
    }
    async function post(text) {
      const count = requests.length;
      await js(`document.querySelector('#input').value=${JSON.stringify(text)}; document.querySelector('#input').dispatchEvent(new Event('input')); document.querySelector('#send-btn').click()`);
      await until(() => requests.length === count + 1 && !!release, 'submitted prompt reaches the provider');
      return requests.at(-1);
    }
    async function done() {
      release(); release = null;
      await until(() => js('!document.querySelector("#new-answer-thread").disabled'), 'answer finishes');
    }
    async function reset() {
      await js('document.querySelector("#new-answer-thread").click()');
      await until(() => js('!document.querySelector(".response-group")'), 'new thread clears messages');
    }
    try {
      const external = [];
      session.defaultSession.webRequest.onBeforeRequest({ urls:['http://*/*', 'https://*/*'] }, (details, callback) => { external.push(details.url); callback({ cancel:true }); });
      await until(() => js('!!window.CueUserMessages && !!document.querySelector("#messages .ai-text, #messages .chat-empty")'), 'renderer initialized');
      await js('window.CueMeetingModeUI.ready');
      win.setBounds(geometry.restoreBounds({ windowWidth:850, windowHeight:780 }, screen.getPrimaryDisplay().workArea));
      await reset();
      const request = await post(prompt);
      assert.ok(request.turns.at(-1).text.includes(prompt), 'model receives the original indented prompt');
      assert.equal(await js('document.querySelector(".user-message-text").textContent'), prompt, 'sent text keeps tabs, indentation, blank lines and edge spaces');
      const layout = await js(`(() => {
        const text = document.querySelector('.user-message-text'), button = document.querySelector('.user-message-toggle');
        const style = getComputedStyle(text);
        return { whitespace:style.whiteSpace, select:style.userSelect, height:text.clientHeight,
          line:parseFloat(style.lineHeight), full:text.scrollHeight, toggle:!button.hidden, expanded:button.getAttribute('aria-expanded') };
      })()`);
      assert.equal(layout.whitespace, 'pre-wrap'); assert.equal(layout.select, 'text');
      assert.ok(Math.abs(layout.height - layout.line * 6) <= 1, 'preview shows six rendered lines');
      assert.ok(layout.full > layout.height * 3); assert.equal(layout.toggle, true); assert.equal(layout.expanded, 'false');
      await js('document.querySelector(".user-message-copy").click()');
      await until(() => copies.length === 1, 'copy collapsed message');
      assert.equal(copies[0], prompt, 'Copy includes hidden lines with exact whitespace');
      await screenshot('prompt-collapsed');

      const beforeExpand = await js('document.querySelector("#messages").scrollTop');
      await js('document.querySelector(".user-message-toggle").click()');
      assert.equal(await js('document.querySelector(".user-message-toggle").getAttribute("aria-expanded")'), 'true');
      assert.equal(await js('document.querySelector(".user-message-toggle").textContent'), 'Show less');
      assert.ok(await js('(() => {const t=document.querySelector(".user-message-text");return t.clientHeight >= t.scrollHeight-1})()'), 'expanded view contains the complete prompt');
      assert.ok(Math.abs(await js('document.querySelector("#messages").scrollTop') - beforeExpand) < 3, 'expanding does not jump to the end');

      // A real mouse drag must select prompt text instead of moving the overlay.
      const point = await js(`(() => {
        const range=document.createRange(), node=document.querySelector('.user-message-text').firstChild;
        range.setStart(node,4);range.setEnd(node,18);const r=range.getBoundingClientRect();
        return {x:Math.ceil(r.left+1),y:Math.round(r.top+r.height/2),end:Math.floor(r.right-1)};
      })()`);
      const originalBounds = win.getBounds(), beforeGesture = gestureStarts;
      wc.sendInputEvent({ type:'mouseMove', x:point.x, y:point.y });
      wc.sendInputEvent({ type:'mouseDown', x:point.x, y:point.y, button:'left', clickCount:1 }); await pause(35);
      wc.sendInputEvent({ type:'mouseMove', x:point.end, y:point.y, modifiers:['leftButtonDown'] });
      wc.sendInputEvent({ type:'mouseUp', x:point.end, y:point.y, button:'left', clickCount:1 }); await pause(60);
      assert.ok(await js('window.getSelection().toString().includes("class")'), 'mouse selects part of a sent message');
      assert.equal(gestureStarts, beforeGesture); assert.deepEqual(win.getBounds(), originalBounds);

      // Intercept native Copy's DOM event so the test never changes the user's
      // real clipboard. This is the same action used by the Edit menu / Cmd+C.
      await js(`window.__copiedSelection=null; document.addEventListener('copy',event=>{
        window.__copiedSelection=window.getSelection().toString();event.preventDefault();
      });(() => {const node=document.querySelector('.user-message-text').firstChild,range=document.createRange();
        const start=node.textContent.indexOf('        for (int num');
        range.setStart(node,start);range.setEnd(node,node.textContent.indexOf('        sort(gains'));
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);})();`);
      const selected = await js('window.getSelection().toString()');
      wc.copy(); await until(() => js('window.__copiedSelection!==null'), 'native Copy action');
      assert.equal(await js('window.__copiedSelection'), selected);
      assert.match(selected, /\n            sum \+= num;\n\n/);
      wc.emit('context-menu', {}, { selectionText:selected, isEditable:false });
      assert.equal(contextMenus.length, 1, 'selected text offers the native Copy context menu');
      wc.emit('context-menu', {}, { selectionText:'', isEditable:false });
      assert.equal(contextMenus.length, 1, 'empty areas do not open a copy menu');
      await js('window.getSelection().removeAllRanges()');
      await screenshot('prompt-expanded');

      const readingPosition = await js('document.querySelector("#messages").scrollTop');
      wc.send('llm:token', { text:'Still considering the code.\n\n' }); await pause(160);
      assert.equal(await js('document.querySelector("#messages").scrollTop'), readingPosition, 'streaming does not interrupt reading the expanded prompt');
      assert.equal(await js('document.querySelector(".user-bubble").classList.contains("expanded")'), true);
      await done();
      await js('document.querySelector(".user-message-toggle").scrollIntoView({block:"center"})');
      await js('document.querySelector(".user-message-toggle").click()');
      assert.equal(await js('document.querySelector(".user-message-toggle").getAttribute("aria-expanded")'), 'false');
      assert.equal(await js('document.querySelector(".user-message-text").textContent'), prompt);

      await reset();
      await post('A short question.'); await done();
      assert.equal(await js('document.querySelector(".user-message-toggle").hidden'), true, 'short messages have no expansion control');
      await post('<img src=x onerror="window.UNSAFE=true">\n<script>window.UNSAFE=true</script>'); await done();
      assert.equal(await js('!window.UNSAFE && !document.querySelector(".user-bubble img, .user-bubble script")'), true, 'prompts are literal text, never executable markup');

      await reset();
      win.setBounds(geometry.restoreBounds({ windowWidth:1180, windowHeight:780 }, screen.getPrimaryDisplay().workArea)); await pause(90);
      await post('Explain how this works. '.repeat(18)); await done();
      assert.equal(await js('document.querySelector(".user-message-toggle").hidden'), true, 'wrapped prose fits at a wide size');
      win.setBounds(geometry.restoreBounds({ windowWidth:520, windowHeight:600 }, screen.getPrimaryDisplay().workArea));
      await until(() => js('!document.querySelector(".user-message-toggle").hidden'), 'narrowing the window adds the preview control');
      assert.equal(await js('document.body.scrollWidth===innerWidth'), true, 'long messages never widen the overlay');
      await screenshot('prompt-narrow');
      wc.setZoomFactor(1.3); await pause(140);
      assert.ok(await js('(() => {const t=document.querySelector(".user-message-text");return Math.abs(t.clientHeight-parseFloat(getComputedStyle(t).lineHeight)*6)<=1})()'), 'preview height follows text zoom');
      wc.setZoomFactor(1);

      await reset(); await post('prefix_' + 'long_identifier_'.repeat(600)); await done();
      assert.equal(await js('document.body.scrollWidth===innerWidth'), true, 'unbroken tokens stay within the message');
      assert.equal(await js('document.querySelector(".user-message-toggle").hidden'), false);
      rejectCopy = true;
      await js('document.querySelector(".user-message-copy").click()');
      await until(() => js('document.querySelector("#cue-status").textContent.includes("Could not copy")'), 'clipboard failure is visible');
      assert.equal(await js('document.querySelector(".user-message-copy").disabled'), false, 'copy can be retried');
      assert.deepEqual(external, [], 'sent messages fetch no external resources');
      clearTimeout(timeout);
      console.log('PASS: exact prompt whitespace, six-line previews, expand/collapse, full and selected-text copy, native context menu, mouse selection without dragging, resize/zoom, safe literal content, clipboard retry and streaming scroll stability.');
      app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
