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
      await until(() => js('!!window.CueAnswerFormat && !!document.querySelector("#messages .ai-text")'), 'renderer initialized');
      win.setBounds(geometry.restoreBounds({windowWidth:820,windowHeight:750}, screen.getPrimaryDisplay().workArea));
      await js("document.querySelector('#messages').replaceChildren()");
      wc.send('llm:start', { userBubble:'Solve LeetCode 643', small:false });
      const codeEnd = answer.indexOf('```\n\n## Complexity');
      wc.send('llm:token', { text:answer.slice(0, codeEnd) });
      await until(() => js("!!document.querySelector('.response-group .language-python .hljs-keyword')"), 'unfinished streamed code is highlighted');
      assert.ok(await js("!!document.querySelector('.response-group .katex')"), 'inline math renders before completion');
      assert.ok(await js("!!document.querySelector('.response-group .ai-caret')"));
      wc.send('llm:token', { text:answer.slice(codeEnd) }); wc.send('llm:done');
      await until(() => js("!!document.querySelector('.response-group .answer-equation .katex')"), 'display equation rendered');
      assert.equal(await js("document.querySelector('.response-group pre code').textContent"), code);
      assert.equal(await js("document.querySelectorAll('.response-group .ai-caret').length"), 0);
      assert.equal(await js("document.querySelector('.response-group .answer-content').getAttribute('aria-busy')"), 'false');
      assert.equal(await js("document.querySelector('.response-group table tbody tr td').textContent"), 'Sliding window');
      const colors = await js("({function:getComputedStyle(document.querySelector('.hljs-title.function_')).color,keyword:getComputedStyle(document.querySelector('.hljs-keyword')).color,code:getComputedStyle(document.querySelector('.answer-code code')).color})");
      assert.equal(new Set(Object.values(colors)).size, 3, 'code has distinct readable syntax colors');
      await js("document.querySelector('.answer-code-copy').click()"); await until(() => copies.length === 1, 'copy code via native clipboard IPC');
      assert.equal(copies[0], code);
      await js('document.fonts.ready');
      assert.equal(await js("[...document.fonts].filter(font=>font.status==='loaded').some(font=>font.family.includes('KaTeX'))"), true, 'local math fonts load under the app CSP');
      await js("document.querySelector('#messages').scrollTop=0"); await pause(100); await screenshot('code-answer');
      await js("document.querySelector('.answer-equation').scrollIntoView({block:'center'})"); await screenshot('math-answer');
      assert.deepEqual(external, [], 'formatted answers never fetch external resources');

      const hostile = '<img src=x onerror="window.UNSAFE=true">\n\n![track](https://example.com/track.png)\n\n\\(\\includegraphics{https://example.com/pixel}\\)';
      wc.send('llm:start', {}); wc.send('llm:token', { text:hostile }); wc.send('llm:done');
      await until(() => js("document.querySelectorAll('.response-group').length===2"), 'untrusted answer completes');
      assert.equal(await js("!window.UNSAFE && document.querySelectorAll('#messages img, #messages iframe, #messages script, #messages a[href]').length===0"), true);
      assert.deepEqual(external, []);

      ipcMain.removeHandler('sessions:list'); ipcMain.handle('sessions:list', () => [{ id:'synthetic',title:'Formatting test',turnCount:1,startedAt:1 }]);
      ipcMain.removeHandler('sessions:get'); ipcMain.handle('sessions:get', () => ({ id:'synthetic',title:'Formatting test',turnCount:1,startedAt:1,summary:answer,keyPoints:['The result is \\(\\frac{1}{k}\\sum a_i\\).'],transcript:[{ channel:'you',text:hostile,ts:1 }] }));
      await js("document.querySelector('#sessions-btn').click()"); await until(() => js("!!document.querySelector('.session-card')"), 'saved sessions');
      await js("document.querySelector('.session-card').click()"); await until(() => js("!!document.querySelector('.session-summary .answer-code')"), 'saved notes share formatting');
      assert.equal(await js("document.querySelector('.session-summary pre code').textContent"), code);
      assert.ok(await js("!!document.querySelector('.session-notes .katex')"));
      assert.equal(await js("document.querySelector('.session-turn p').textContent"), hostile, 'spoken transcript stays literal');
      await js("document.querySelector('.session-summary .answer-code-copy').click()"); await until(() => copies.length === 2, 'copy saved code'); assert.equal(copies[1], code);
      await js("document.querySelector('#sessions-close').click()");
      win.setBounds(geometry.restoreBounds({windowWidth:520,windowHeight:360},screen.getPrimaryDisplay().workArea)); await pause(100);
      const layout = await js("({send:document.querySelector('#send-btn').getBoundingClientRect().bottom,panel:document.querySelector('#panel').getBoundingClientRect().bottom,body:document.body.scrollWidth,width:innerWidth})");
      assert.ok(layout.send <= layout.panel); assert.equal(layout.body, layout.width, 'code and math scroll within the panel');
      assert.deepEqual(external, []);
      clearTimeout(timeout); console.log('PASS: streamed math and syntax colors, exact code copy, local fonts, safe content, saved notes and narrow layouts.'); app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
