// Isolated request/renderer regression. Never reads the user's profile, captures
// a physical source, or calls a real model. Run with Electron.
const { app, systemPreferences, desktopCapturer, globalShortcut } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-response-context-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({
  onboarded: true, provider: 'openai', screenShareProtection: false,
  apiKeys: { openai: 'synthetic-only' },
  salaryTarget: '$100k', whyCompany: 'Their accessibility work.',
}), { mode: 0o600 });
const turns = [
  { channel: 'them', text: 'Tell me about a time you improved reliability.', ts: Date.now() - 5000 },
  { channel: 'you', text: 'The Redis queue used a 30-second retry delay. I did not build the queue.', ts: Date.now() - 4000 },
  { channel: 'them', text: 'Why that delay?', ts: Date.now() - 3000 },
  { channel: 'them', text: 'What are your salary expectations?', ts: Date.now() - 2000 },
];
fs.writeFileSync(path.join(profile, 'meetings.json'), JSON.stringify([{
  id: 'response-fixture', title: 'Synthetic interview', startedAt: Date.now() - 6000,
  endedAt: null, transcript: turns, summary: '', actionItems: [], followUp: [],
}]));
systemPreferences.getMediaAccessStatus = () => 'denied';
systemPreferences.askForMediaAccess = () => { throw Error('Physical capture permission is forbidden'); };
desktopCapturer.getSources = () => { throw Error('Physical screen capture is forbidden'); };
globalShortcut.register = () => false; globalShortcut.unregister = () => {}; globalShortcut.unregisterAll = () => {};
let captureWorks = true;
require('../src/screen').captureScreenshot = async () => {
  if (!captureWorks) throw Error('Synthetic unavailable screenshot');
  return 'data:image/png;base64,c3ludGhldGlj';
};
require('../src/model-catalog').createModelCatalog = () => ({ get: async () => ({ models: [], live: false }) });
const requests = [];
let nextResult = 'I used a retry delay to let the upstream service recover.', failure = false, hold = false, release;
require('../src/llm').createLLM = () => ({ ready: true, provider: 'openai', model: 'synthetic', async stream(request) {
  if (request.system.startsWith('You are cue, writing private meeting notes')) return 'Synthetic meeting summary.';
  requests.push(request);
  const result = nextResult;
  if (hold) {
    request.onToken?.('Old partial answer');
    await new Promise(resolve => { release = resolve; });
    request.onToken?.('LATE_OLD_TOKEN');
    return 'Old finished answer';
  }
  if (failure) { request.onToken?.('FAILED_PARTIAL'); throw Error('Synthetic provider failure'); }
  if (result) request.onToken?.(result);
  return result;
} });
const appLink = require('../vendor/app-link'), BaseServer = appLink.AppLinkServer;
appLink.AppLinkServer = class extends BaseServer { constructor(options) { super({ ...options, appId: options.appId + '.response-test-' + process.pid }); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 250; i++) { if (await check()) return; await pause(20); } throw Error('Timed out: ' + label); }
const deadline = setTimeout(() => fail(Error('Response context smoke timed out')), 45000);
function fail(error) { clearTimeout(deadline); console.error(error); app.exit(1); }
process.on('unhandledRejection', fail); process.on('uncaughtException', fail);
app.on('browser-window-created', (_, win) => {
  win.hide(); win.show = () => {}; win.showInactive = () => {}; win.focus = () => {};
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    const js = code => win.webContents.executeJavaScript(code, true);
    async function ask(mode, text, { callsProvider = true } = {}) {
      const before = requests.length;
      await js(`window.cue.ask(${JSON.stringify({ mode, text })})`);
      if (callsProvider) await until(() => requests.length === before + 1, 'provider receives ' + mode);
      await until(() => js('!document.querySelector("#new-answer-thread").disabled'), 'answer settles');
      if (!callsProvider) { await pause(80); assert.equal(requests.length, before, 'missing evidence does not call a provider'); }
      return requests.at(-1);
    }
    try {
      await until(() => js('!!window.CueMeetingModeUI && !!document.querySelector("#new-answer-thread")'), 'renderer initialized');
      await js('window.CueMeetingModeUI.ready');
      let request = await ask('answerThis', 'Why that delay?');
      assert.match(request.turns[0].text, /Redis queue used a 30-second retry delay/);
      assert.doesNotMatch(request.turns[0].text, /salary expectations/);
      assert.match(await js('document.querySelector(".category-pill").textContent'), /Behavioral/);
      assert.equal(request.maxTokens, 768);
      request = await ask('ask', 'Make that answer shorter.');
      assert.deepEqual(request.turns.map(turn => turn.role), ['user', 'assistant', 'user']);
      assert.match(request.turns[1].text, /upstream service recover/);
      assert.equal(request.maxTokens, 2200);
      assert.match(request.system, /suggested drafts, not evidence/);

      request = await ask('recap', '');
      assert.equal(request.turns.length, 1);
      assert.doesNotMatch(request.turns[0].text, /upstream service recover/);
      request = await ask('ask', 'Add one concrete example.');
      assert.equal(request.turns.length, 5, 'recap does not pollute the answer thread');
      await js('document.querySelector("#new-answer-thread").click()');
      await until(() => js('document.querySelector("#messages").children.length===0'), 'New thread clears answers');
      request = await ask('ask', 'Fresh question.');
      assert.equal(request.turns.length, 1);
      assert.doesNotMatch(request.turns[0].text, /Redis queue/, 'new saved chat excludes unrelated inactive recordings');

      await js('window.cue.meetingModesMutate("activate",{id:"interview"})');
      request = await ask('ask', 'Why do you want to work here?');
      assert.equal(request.turns.length, 1, 'switching active mode isolates earlier drafts');
      assert.match(request.system, /Their accessibility work/);
      assert.doesNotMatch(request.system, /Salary Target/);
      const beforeFailure = request.turns.length;
      failure = true;
      await ask('ask', 'Failure fixture.');
      failure = false;
      nextResult = '';
      await ask('ask', 'Empty fixture.');
      assert.match(await js('document.querySelector("#messages .response-group:last-child").textContent'), /returned no answer/);
      nextResult = 'A complete synthetic answer.';
      request = await ask('ask', 'After the failed requests.');
      assert.equal(request.turns.length, beforeFailure + 2);
      assert.doesNotMatch(JSON.stringify(request.turns), /FAILED_PARTIAL|Failure fixture|Empty fixture/);
      await js('window.cue.settingsSet({smart:true})');
      request = await ask('leetcode', '');
      assert.equal(request.turns.length, 1);
      assert.equal(request.maxTokens, 6144);
      assert.ok(request.imageDataUrl);
      captureWorks = false;
      await ask('leetcode', '', { callsProvider: false });

      hold = true;
      const beforeHold = requests.length;
      await js('window.cue.ask({mode:"ask",text:"Pending old thread"})');
      await until(() => requests.length > beforeHold && !!release, 'pending stream');
      assert.equal(await js('document.querySelector("#new-answer-thread").disabled'), true);
      assert.equal((await js('window.cue.resetAnswerThread()')).ok, false);
      await js('window.cue.clearTranscript()');
      release(); hold = false;
      await until(() => js('!document.querySelector("#new-answer-thread").disabled'), 'stale stream settles');
      assert.doesNotMatch(await js('document.querySelector("#messages").textContent'), /LATE_OLD_TOKEN|Old partial/);
      await ask('say', '', { callsProvider: false });
      await ask('assist', '', { callsProvider: false });
      request = await ask('ask', 'New topic after clearing.');
      assert.equal(request.turns.length, 1);
      assert.doesNotMatch(JSON.stringify(request.turns), /Redis queue|Old finished|Pending old/);
      assert.equal(await js('document.querySelectorAll("#new-answer-thread").length'), 1);

      clearTimeout(deadline);
      console.log('PASS: audio follow-up context, latest question routing, threaded chat, reset/mode isolation, completed-answer-only memory, recap isolation, evidence gates, output budgets, and stale stream protection.');
      app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
