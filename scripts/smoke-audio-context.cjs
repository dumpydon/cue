// Exercise real Web Audio + AudioWorklets, both IPC channels, streaming turn
// commits, history persistence and prompt context. Sources and servers are
// synthetic: never opens a physical mic, screen stream, or cloud connection.
const { app, BrowserWindow, systemPreferences, desktopCapturer, globalShortcut } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-audio-context-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({ onboarded: true, provider: 'openai', sttProvider: 'openai', meetingAudio: true, screenShareProtection: false, apiKeys: { openai: 'synthetic-key' } }));
systemPreferences.getMediaAccessStatus = () => 'granted';
systemPreferences.askForMediaAccess = () => { throw Error('No permission requests allowed'); };
desktopCapturer.getSources = () => { throw Error('No physical screen capture allowed'); };
globalShortcut.register = () => false; globalShortcut.unregister = () => {}; globalShortcut.unregisterAll = () => {};
const sockets = [], requests = [];
const phrases = ['I will test the microphone and send the report on Thursday.', 'The meeting deadline is Friday and we need to test the audio.'];
class Socket extends EventEmitter {
  constructor() { super(); this.readyState = 0; this.channel = sockets.length % 2; this.text = phrases[this.channel]; this.item = 'item-' + sockets.length; this.bytes = 0; this.commits = 0; sockets.push(this); setImmediate(() => { this.readyState = 1; this.emit('open'); }); }
  event(event) { this.emit('message', Buffer.from(JSON.stringify(event))); }
  send(raw) {
    const event = JSON.parse(raw);
    if (event.type === 'session.update') setImmediate(() => this.event({ type: 'session.updated' }));
    if (event.type === 'input_audio_buffer.append') {
      this.bytes += Buffer.from(event.audio, 'base64').length;
      if (!this.started) { this.started = true; for (const word of this.text.match(/\S+\s*/g)) this.event({ type: 'conversation.item.input_audio_transcription.delta', item_id: this.item, delta: word }); }
    }
    if (event.type === 'input_audio_buffer.commit') {
      this.commits++; const item = this.item, text = this.text;
      this.event({ type: 'input_audio_buffer.committed', item_id: item });
      setTimeout(() => this.event({ type: 'conversation.item.input_audio_transcription.completed', item_id: item, transcript: text }), 35);
    }
  }
  close(code) { this.readyState = 3; this.emit('close', code); }
}
const wsPath = require.resolve('ws'); require.cache[wsPath] = { id: wsPath, filename: wsPath, loaded: true, exports: Socket };
require('../src/llm').createLLM = () => ({ ready: true, model: 'synthetic', stream: async request => { requests.push(request); request.onToken?.('Synthetic recap.'); return 'Synthetic recap.'; } });
const appLink = require('../vendor/app-link'), BaseServer = appLink.AppLinkServer;
appLink.AppLinkServer = class extends BaseServer { constructor(options) { super({ ...options, appId: options.appId + '.audio-test-' + process.pid }); } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) { for (let i = 0; i < 250; i++) { if (await check()) return; await pause(20); } throw Error('Timed out: ' + label); }
const deadline = setTimeout(() => fail(Error('Audio regression timed out')), 30000);
function fail(error) { clearTimeout(deadline); console.error(error); app.exit(1); }
process.on('unhandledRejection', fail); process.on('uncaughtException', fail);
app.on('browser-window-created', (_event, win) => {
  win.hide(); win.showInactive = () => {}; win.show = () => {}; win.focus = () => {}; win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    const js = code => win.webContents.executeJavaScript(code, true);
    try {
      await until(() => js('!!window.CueListening && !!document.querySelector("#messages .ai-text")'), 'renderer startup');
      await js(`(() => {
        window.fixtures = { contexts: [], gains: {}, streams: {} };
        async function audio(channel) {
          const ctx = new AudioContext({sampleRate:16000}); await ctx.resume(); fixtures.contexts.push(ctx);
          const oscillator = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
          gain.gain.value = .1; oscillator.frequency.value = channel === 'you' ? 440 : 660;
          oscillator.connect(gain); gain.connect(dest); oscillator.start(); fixtures.gains[channel] = gain;
          return dest.stream;
        }
        navigator.mediaDevices.getUserMedia = async () => fixtures.streams.you = await audio('you');
        navigator.mediaDevices.getDisplayMedia = async () => {
          const sound = await audio('them'), canvas = document.createElement('canvas'); canvas.width=2; canvas.height=2;
          canvas.getContext('2d').fillRect(0,0,2,2);
          return fixtures.streams.them = new MediaStream([...sound.getAudioTracks(), ...canvas.captureStream(1).getVideoTracks()]);
        };
      })()`);
      await js('window.CueListening.toggle()');
      await until(() => sockets.length === 2 && sockets.every(socket => socket.bytes > 4000), 'both AudioWorklets send PCM');
      await until(() => js(`document.querySelector('.interim-transcript').textContent.includes('Thursday.') && document.querySelector('.interim-transcript').textContent.includes('Friday')`), 'complete live sentences on both channels');
      assert.equal(await js("document.querySelectorAll('.ts-interim-row').length"), 2);
      assert.equal(await js("fixtures.streams.them.getVideoTracks()[0].readyState"), 'live', 'loopback session keeps its display track alive');
      assert.equal(await js("document.querySelector('.input-interim') === null"), true, 'no duplicate overlapping preview');
      assert.equal(await js("document.querySelector('.interim-transcript').getBoundingClientRect().bottom <= document.querySelector('#action-row').getBoundingClientRect().top"), true);
      const size = win.getBounds(); win.setSize(size.width, 360); await pause(80);
      assert.equal(await js("document.querySelector('#send-btn').getBoundingClientRect().bottom <= document.querySelector('#panel').getBoundingClientRect().bottom"), true, 'live captions do not push send controls outside a small window');
      win.setBounds(size);
      await js('window.cue.ask({mode:"recap",text:""})');
      await until(() => requests.length > 0, 'Recap receives unfinished speech');
      for (const phrase of phrases) assert.ok(JSON.stringify(requests.at(-1).turns).includes(phrase));
      await js('fixtures.gains.you.gain.value=0');
      await until(() => sockets[0].commits === 1, 'microphone turn commits after silence');
      await until(() => js("!document.querySelector('.ts-you.ts-interim-row')"), 'microphone final clears only its preview');
      assert.ok(await js("document.querySelector('.ts-them.ts-interim-row').textContent.includes('Friday')"));
      await js('fixtures.gains.them.gain.value=0');
      await until(() => sockets[1].commits === 1, 'meeting turn commits after silence');
      await until(() => js("document.querySelectorAll('.ts-interim-row').length===0"), 'finals replace both previews');
      assert.ok(await js("document.querySelector('#input').value.includes('Friday')"), 'complete other-speaker sentence fills composer');
      const tail = 'The last sentence must survive stopping the session.';
      sockets[0].text = tail; sockets[0].item = 'tail'; sockets[0].started = false;
      await js('fixtures.gains.you.gain.value=.1'); await pause(350);
      await js('window.CueListening.toggle()');
      await until(() => js("Object.values(fixtures.streams).every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))"), 'stop closes microphone and loopback tracks');
      await until(() => fs.existsSync(path.join(profile, 'meetings.json')) && JSON.parse(fs.readFileSync(path.join(profile, 'meetings.json'))).some(meeting => meeting.transcript.some(turn => turn.text === tail)), 'last sentence persists');
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'meetings.json'))).flatMap(meeting => meeting.transcript);
      for (const phrase of [...phrases, tail]) assert.equal(saved.filter(turn => turn.text === phrase).length, 1);
      const count = requests.length; await js('window.cue.ask({mode:"recap",text:""})'); await until(() => requests.length > count, 'Recap after stop');
      for (const phrase of [...phrases, tail]) assert.ok(JSON.stringify(requests.at(-1).turns).includes(phrase));
      await js('window.CueListening.toggle()');
      await until(() => sockets.length === 4 && sockets.slice(2).every(socket => socket.bytes > 2000), 'restart opens fresh speech sessions');
      await js('window.cue.settingsSet({sttProvider:"local"})');
      assert.equal(await js('window.cue.captureState().then(state=>state.active)'), false, 'changing to local stops the old cloud streams');
      assert.ok(sockets.every(socket => socket.readyState === 3));
      await js('Promise.all(fixtures.contexts.map(ctx=>ctx.close()))');
      clearTimeout(deadline); console.log('PASS: real synthetic mic/loopback PCM, full live sentences, separate speaker previews, VAD commits, persisted history, stop tail, and Recap context.'); app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
