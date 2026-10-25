// Full renderer + IPC regression with synthetic responses, no provider calls,
// capture, microphone requests, or changes to the user's clipboard/profile.
const { app, BrowserWindow, systemPreferences, desktopCapturer, globalShortcut, ipcMain, clipboard, screen, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const geometry = require('../src/window-geometry');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-answer-format-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({ onboarded: true, screenShareProtection: false }));
systemPreferences.getMediaAccessStatus = () => 'granted';
systemPreferences.askForMediaAccess = () => { throw Error('No permission requests allowed'); };
desktopCapturer.getSources = () => { throw Error('No screen capture allowed'); };
globalShortcut.register = () => false; globalShortcut.unregister = () => {}; globalShortcut.unregisterAll = () => {};
require('../src/llm').createLLM = () => { throw Error('No provider calls allowed'); };
const copies = []; clipboard.writeText = text => { copies.push(text); };
const appLink = require('../vendor/app-link'), BaseServer = appLink.AppLinkServer;
appLink.AppLinkServer = class extends BaseServer { constructor(options) { super({ ...options, appId: options.appId + '.answers-' + process.pid }); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 200; i++) { if (await check()) return; await pause(20); } throw Error('Timed out: ' + label); }
const timeout = setTimeout(() => fail(Error('Answer formatting regression timed out')), 30000);
function fail(error) { clearTimeout(timeout); console.error(error); app.exit(1); }
process.on('unhandledRejection', fail); process.on('uncaughtException', fail);
const code = 'class Solution:\n    def findMaxAverage(self, nums: list[int], k: int) -> float:\n        window_sum = sum(nums[:k])\n        best = window_sum\n        for right in range(k, len(nums)):\n            window_sum += nums[right] - nums[right - k]\n            best = max(best, window_sum)\n        return best / k\n';
const answer = '# Maximum Average Subarray I\n\n## Approach\nUse a sliding window. Each step costs \\(O(1)\\).\n\n' +
  '```python\n' + code + '```\n\n## Complexity\nTime \\(O(n)\\), space \\(O(1)\\).\n\n\\[\n\\text{average} = \\frac{1}{k} \\sum_{i=l}^{l+k-1} a_i\n\\]\n\n' +
  '| Algorithm | Time | Space |\n| --- | --- | --- |\n| Sliding window | $O(n)$ | $O(1)$ |\n';
app.on('browser-window-created', (_event, win) => {
  win.hide(); win.showInactive = () => {}; win.show = () => {}; win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    const wc = win.webContents, js = source => wc.executeJavaScript(source, true);
    async function screenshot(name) {
      const directory = process.env.CUE_WINDOW_QA_DIR; if (!directory) return;
      fs.mkdirSync(directory, { recursive: true });
      const bounds = win.getBounds(); const image = await wc.capturePage({ x:300, y:0, width:bounds.width-600, height:bounds.height });
      fs.writeFileSync(path.join(directory, name + '.png'), image.toPNG());
    }
    try {
      const external = []; session.defaultSession.webRequest.onBeforeRequest({ urls:['http://*/*', 'https://*/*'] }, (details, callback) => { external.push(details.url); callback({ cancel:true }); });
      await until(() => js('!!window.CueAnswerFormat && !!document.querySelector("#messages .ai-text, #messages .chat-empty")'), 'renderer initialized');
      win.setBounds(geometry.restoreBounds({windowWidth:820,windowHeight:750}, screen.getPrimaryDisplay().workArea));
      await js("document.querySelector('#messages').replaceChildren()");
      wc.send('llm:start', { userBubble:'Solve LeetCode 643', small:false });
      const codeEnd = answer.indexOf('```\n\n## Complexity');
      wc.send('llm:token', { text:answer.slice(0, codeEnd) });
      await until(() => js("!!document.querySelector('.response-group .language-python .hljs-keyword')"), 'unfinished streamed code is highlighted');
      assert.ok(await js("!!document.querySelector('.response-group .katex')"), 'inline math renders before completion');
      assert.ok(await js("!!document.querySelector('.response-group .ai-caret')"));
      assert.equal(await js("document.querySelectorAll('.response-group .answer-actions').length"), 0, 'whole-answer copy waits for completion');
      await js("document.querySelector('.response-group .answer-code-wrap').click()");
      assert.equal(await js("document.querySelector('.answer-code-wrap').getAttribute('aria-pressed')"), 'true');
      wc.send('llm:token', { text:answer.slice(codeEnd) }); wc.send('llm:done');
      await until(() => js("!!document.querySelector('.response-group .answer-equation .katex')"), 'display equation rendered');
      assert.equal(await js("document.querySelector('.response-group pre code').textContent"), code);
      assert.equal(await js("document.querySelector('.response-group .answer-code').classList.contains('wrapped')"), true, 'wrapping survives streamed redraw and completion');
      assert.equal(await js("getComputedStyle(document.querySelector('.response-group pre code')).whiteSpace"), 'pre-wrap');
      await js("document.querySelector('.response-group .answer-code-wrap').click()");
      assert.equal(await js("getComputedStyle(document.querySelector('.response-group pre code')).whiteSpace"), 'pre');
      assert.equal(await js("document.querySelectorAll('.response-group .ai-caret').length"), 0);
      assert.equal(await js("document.querySelector('.response-group .answer-content').getAttribute('aria-busy')"), 'false');
      assert.equal(await js("document.querySelector('.response-group table tbody tr td').textContent"), 'Sliding window');
      const colors = await js("({function:getComputedStyle(document.querySelector('.hljs-title.function_')).color,keyword:getComputedStyle(document.querySelector('.hljs-keyword')).color,code:getComputedStyle(document.querySelector('.answer-code code')).color})");
      assert.equal(new Set(Object.values(colors)).size, 3, 'code has distinct readable syntax colors');
      await js("document.querySelector('.answer-code-copy').click()"); await until(() => copies.length === 1, 'copy code via native clipboard IPC');
      assert.equal(copies[0], code);
      await js("document.querySelector('.answer-copy[data-format=text]').click()");
      await until(() => copies.length === 2, 'copy whole answer as readable text');
      assert.ok(copies[1].startsWith('Maximum Average Subarray I\n\nApproach\n\nUse a sliding window.'));
      assert.ok(copies[1].includes(code.trimEnd()), 'plain answer keeps exact code indentation');
      assert.equal((copies[1].match(/\\frac/g) || []).length, 1, 'math is copied once');
      assert.ok(!copies[1].includes('Copy code') && !copies[1].includes('```'));
      await js("document.querySelector('.answer-copy[data-format=markdown]').click()");
      await until(() => copies.length === 3, 'copy original Markdown');
      assert.equal(copies[2], answer, 'Markdown copy preserves code fences and all math delimiters');
      await js('document.fonts.ready');
      assert.equal(await js("[...document.fonts].filter(font=>font.status==='loaded').some(font=>font.family.includes('KaTeX'))"), true, 'local math fonts load under the app CSP');
      await js("document.querySelector('#messages').scrollTop=0"); await pause(100); await screenshot('code-answer');
      await until(() => js("!document.querySelector('#latest-answer').hidden"), 'jump to latest appears when reading earlier content');
      await js("document.querySelector('#latest-answer').click()");
      assert.equal(await js("document.querySelector('#latest-answer').hidden"), true);
      await js("document.querySelector('.answer-equation').scrollIntoView({block:'center'})"); await screenshot('math-answer');
      assert.deepEqual(external, [], 'formatted answers never fetch external resources');

      const hostile = '<img src=x onerror="window.UNSAFE=true">\n\n![track](https://example.com/track.png)\n\n\\(\\includegraphics{https://example.com/pixel}\\)';
      await js("document.querySelector('#messages').scrollTop=0");
      wc.send('llm:start', {}); wc.send('llm:token', { text:hostile }); wc.send('llm:done');
      await until(() => js("document.querySelectorAll('.response-group').length===2"), 'untrusted answer completes');
      assert.equal(await js("!window.UNSAFE && document.querySelectorAll('#messages img, #messages iframe, #messages script, #messages a[href]').length===0"), true);
      assert.deepEqual(external, []);
      assert.equal(await js("document.querySelector('#messages').scrollTop"), 0, 'new responses do not pull the reader away from earlier content');
      assert.equal(await js("document.querySelector('#latest-answer').hidden"), false);

      ipcMain.removeHandler('sessions:list'); ipcMain.handle('sessions:list', () => [{ id:'synthetic',title:'Formatting test',turnCount:1,startedAt:1 }]);
      ipcMain.removeHandler('sessions:get'); ipcMain.handle('sessions:get', () => ({ id:'synthetic',title:'Formatting test',turnCount:1,startedAt:1,summary:answer,keyPoints:['The result is \\(\\frac{1}{k}\\sum a_i\\).'],transcript:[{ channel:'you',text:hostile,ts:1 }] }));
      await js("document.querySelector('#sessions-btn').click(); document.querySelector('[data-tab=recordings]').click()"); await until(() => js("!!document.querySelector('.session-card')"), 'saved sessions');
      await js("document.querySelector('.session-card').click()"); await until(() => js("!!document.querySelector('.session-summary .answer-code')"), 'saved notes share formatting');
      assert.equal(await js("document.querySelector('.session-summary pre code').textContent"), code);
      assert.ok(await js("!!document.querySelector('.session-notes .katex')"));
      assert.equal(await js("document.querySelector('.session-turn p').textContent"), hostile, 'spoken transcript stays literal');
      await js("document.querySelector('.session-summary .answer-code-copy').click()"); await until(() => copies.length === 4, 'copy saved code'); assert.equal(copies[3], code);
      await js("document.querySelector('#sessions-close').click()");
      win.setBounds(geometry.restoreBounds({windowWidth:520,windowHeight:360},screen.getPrimaryDisplay().workArea)); await pause(100);
      const layout = await js("({send:document.querySelector('#send-btn').getBoundingClientRect().bottom,panel:document.querySelector('#panel').getBoundingClientRect().bottom,body:document.body.scrollWidth,width:innerWidth})");
      assert.ok(layout.send <= layout.panel); assert.equal(layout.body, layout.width, 'code and math scroll within the panel');
      await js("document.querySelector('.response-group .answer-code-wrap').click()");
      const wrapped = await js("(() => {const p=document.querySelector('.response-group pre');return {content:p.scrollWidth,width:p.clientWidth};})()");
      assert.ok(wrapped.content <= wrapped.width + 1, 'wrapped code fits a narrow panel without horizontal scrolling');
      assert.deepEqual(external, []);
      win.setBounds(geometry.restoreBounds({windowWidth:1180,windowHeight:750},screen.getPrimaryDisplay().workArea)); await pause(100);
      wc.send('llm:start', {userBubble:'Explain discounted cash flow clearly'});
      wc.send('llm:token', {text:'A **discounted cash flow (DCF)** estimates what a business is worth today by discounting its expected future cash flows.\n\n## How it works\n1. Forecast free cash flow.\n2. Discount each year at an appropriate rate.\n3. Add the present value of the terminal value.\n\n\\[\nPV = \\sum_{t=1}^{n} \\frac{FCF_t}{(1+r)^t}\n\\]\n\n## What to watch\nThe result is sensitive to the **discount rate** and **terminal growth** assumptions.'}); wc.send('llm:done');
      await until(() => js("document.querySelectorAll('.response-group').length===3 && document.querySelectorAll('.answer-actions').length===3"), 'structured explanatory answer');
      await js("document.querySelector('#latest-answer').click()");
      const measure = await js("(() => {const a=document.querySelector('.response-group:last-child .ai-text'),p=a.querySelector('p');return {answer:a.clientWidth,prose:p.getBoundingClientRect().width};})()");
      assert.ok(measure.prose < measure.answer - 50, 'wide answers keep a comfortable prose line length');
      await screenshot('structured-explanation');
      clearTimeout(timeout); console.log('PASS: readable structured answers, whole-answer and Markdown copy, persistent code wrapping, reader-controlled scrolling, math, safe content and narrow layouts.'); app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
