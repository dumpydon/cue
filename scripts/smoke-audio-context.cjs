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
const deadline = setTimeout(() => fail(Error('Audio regression timed out')), 45000);
function fail(error) { clearTimeout(deadline); console.error(error); app.exit(1); }
process.on('unhandledRejection', fail); process.on('uncaughtException', fail);
app.on('browser-window-created', (_event, win) => {
  win.hide(); win.showInactive = () => {}; win.show = () => {}; win.focus = () => {}; win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    const js = code => win.webContents.executeJavaScript(code, true);
    const meterState = channel => js(`document.querySelector('[data-audio-channel="${channel}"]').dataset.state`);
    async function screenshot(name) {
      if (!process.env.CUE_WINDOW_QA_DIR) return;
      fs.mkdirSync(process.env.CUE_WINDOW_QA_DIR, { recursive: true });
      const bounds = win.getBounds();
      const image = await win.webContents.capturePage({ x: 300, y: 0, width: bounds.width - 600, height: bounds.height });
      fs.writeFileSync(path.join(process.env.CUE_WINDOW_QA_DIR, name + '.png'), image.toPNG());
    }
    try {
      await until(() => js('!!window.CueListening && !!document.querySelector("#messages .ai-text, #messages .chat-empty")'), 'renderer startup');
      assert.equal(await meterState('you'), 'off'); assert.equal(await meterState('them'), 'off');
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
      await until(async () => await meterState('you') === 'active' && await meterState('them') === 'active', 'real PCM animates both input meters');
      assert.equal(await js(`document.querySelector('[data-audio-channel="you"]').getAttribute('aria-label')`), 'Your microphone: Audio detected');
      assert.equal(await js(`getComputedStyle(document.querySelector('[data-audio-channel="you"] .audio-bars')).alignItems !== getComputedStyle(document.querySelector('[data-audio-channel="them"] .audio-bars')).alignItems`), true, 'the sources use distinct waveform and level-bar shapes');
      await until(() => js(`document.querySelector('.interim-transcript').textContent.includes('Thursday.') && document.querySelector('.interim-transcript').textContent.includes('Friday')`), 'complete live sentences on both channels');
      assert.equal(await js("document.querySelectorAll('.ts-interim-row').length"), 2);
      assert.equal(await js("fixtures.streams.them.getVideoTracks()[0].readyState"), 'live', 'loopback session keeps its display track alive');
      assert.equal(await js("document.querySelector('.input-interim') === null"), true, 'no duplicate overlapping preview');
      assert.equal(await js("document.querySelector('.interim-transcript').getBoundingClientRect().bottom <= document.querySelector('#action-row').getBoundingClientRect().top"), true);
      await pause(350); await screenshot('audio-both-inputs');
      const size = win.getBounds(); win.setSize(size.width, 360); await pause(80);
      assert.equal(await js("document.querySelector('#send-btn').getBoundingClientRect().bottom <= document.querySelector('#panel').getBoundingClientRect().bottom"), true, 'live captions do not push send controls outside a small window');
      assert.equal(await js("document.querySelector('#audio-activity').getBoundingClientRect().right < document.querySelector('#new-answer-thread').getBoundingClientRect().left"), true, 'input meters fit beside the thread control');
      win.setSize(1120, 360); await pause(80);
      await js(`document.querySelector('#input').value='A long multi-line question.\\n'.repeat(15); document.querySelector('#input').dispatchEvent(new Event('input'))`);
      const compact = await js(`Object.fromEntries(['#panel','#messages','#composer','#input-area','.interim-transcript','#answer-thread-bar'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,{top:r.top,bottom:r.bottom,height:r.height}]}))`);
      assert.ok(compact['#messages'].height >= 24, 'small live-call overlay retains visible answer space with multiline input: ' + JSON.stringify(compact));
      assert.equal(await js("document.querySelector('#send-btn').getBoundingClientRect().bottom <= document.querySelector('#panel').getBoundingClientRect().bottom"), true, 'the live-call send control remains inside the smallest panel');
      assert.equal(await js("document.querySelector('#audio-activity').getBoundingClientRect().right < document.querySelector('#new-answer-thread').getBoundingClientRect().left"), true, 'audio indicators fit in the smallest panel');
      await screenshot('audio-minimum-size');
      await js("document.querySelector('#input').value=''; document.querySelector('#input').dispatchEvent(new Event('input'))");
      win.setBounds(size);
      await js('window.cue.ask({mode:"recap",text:""})');
      await until(() => requests.length > 0, 'Recap receives unfinished speech');
      for (const phrase of phrases) assert.ok(JSON.stringify(requests.at(-1).turns).includes(phrase));
      await js('fixtures.gains.you.gain.value=0');
      await until(() => meterState('you').then(state => state === 'ready'), 'quiet mic settles');
      assert.equal(await meterState('them'), 'active', 'microphone silence never clears call activity');
      await pause(150); await screenshot('audio-call-only');
      await until(() => sockets[0].commits === 1, 'microphone turn commits after silence');
      await until(() => js("!document.querySelector('.ts-you.ts-interim-row')"), 'microphone final clears only its preview');
      assert.ok(await js("document.querySelector('.ts-them.ts-interim-row').textContent.includes('Friday')"));
      await js('fixtures.gains.them.gain.value=0');
      await until(() => meterState('them').then(state => state === 'ready'), 'quiet meeting audio settles');
      await until(() => js(`Array.from(document.querySelectorAll('.audio-bars i')).every(bar=>bar.style.height==='2px')`), 'both silent inputs are flat');
      await until(() => sockets[1].commits === 1, 'meeting turn commits after silence');
      await until(() => js("document.querySelectorAll('.ts-interim-row').length===0"), 'finals replace both previews');
      assert.ok(await js("document.querySelector('#input').value.includes('Friday')"), 'complete other-speaker sentence fills composer');
      const tail = 'The last sentence must survive stopping the session.';
      sockets[0].text = tail; sockets[0].item = 'tail'; sockets[0].started = false;
      await js('fixtures.gains.you.gain.value=.1'); await pause(350);
      await js('window.CueListening.toggle()');
      await until(() => js("Object.values(fixtures.streams).every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))"), 'stop closes microphone and loopback tracks');
      assert.equal(await meterState('you'), 'off'); assert.equal(await meterState('them'), 'off');
      await until(() => fs.existsSync(path.join(profile, 'meetings.json')) && JSON.parse(fs.readFileSync(path.join(profile, 'meetings.json'))).some(meeting => meeting.transcript.some(turn => turn.text === tail)), 'last sentence persists');
      assert.equal(await js("document.querySelector('#live-dot').classList.contains('off')"), true, 'late speech finals cannot relight the stopped listening indicator');
      assert.equal(await js(`Array.from(document.querySelectorAll('.audio-bars i')).every(bar=>getComputedStyle(bar).height==='2px')`), true, 'stopped meters flatten immediately');
      await screenshot('audio-session-off');
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'meetings.json'))).flatMap(meeting => meeting.transcript);
      for (const phrase of [...phrases, tail]) assert.equal(saved.filter(turn => turn.text === phrase).length, 1);
      const count = requests.length; await js('window.cue.ask({mode:"recap",text:""})'); await until(() => requests.length > count, 'Recap after stop');
      for (const phrase of [...phrases, tail]) assert.ok(JSON.stringify(requests.at(-1).turns).includes(phrase));
      await js('window.AudioWorkletNode = function() { throw Error("Synthetic legacy fallback"); }; window.CueListening.toggle()');
      await until(() => sockets.length === 4 && sockets.slice(2).every(socket => socket.bytes > 2000), 'restart opens fresh speech sessions');
      await until(async () => await meterState('you') === 'active' && await meterState('them') === 'active', 'legacy ScriptProcessor feeds both input meters');
      await js('fixtures.streams.you.getAudioTracks()[0].enabled=false');
      await until(() => meterState('you').then(state => state === 'muted'), 'disabled mic track is visibly muted');
      assert.equal(await meterState('them'), 'active');
      await js('fixtures.streams.you.getAudioTracks()[0].enabled=true');
      await until(() => meterState('you').then(state => state === 'active'), 'mic meter recovers after unmute');
      await js('window.cue.settingsSet({sttProvider:"local"})');
      assert.equal(await js('window.cue.captureState().then(state=>state.active)'), false, 'changing to local stops the old cloud streams');
      assert.ok(sockets.every(socket => socket.readyState === 3));
      assert.equal(await meterState('you'), 'off'); assert.equal(await meterState('them'), 'off');
      await js('fixtures.getMic=navigator.mediaDevices.getUserMedia; fixtures.getCall=navigator.mediaDevices.getDisplayMedia; true');
      if (process.platform === 'darwin') {
        await js('document.querySelector(\'#meeting-audio-seg [data-meeting-audio="off"]\').click(); window.cue.settingsSet({sttProvider:"openai",meetingAudio:false})');
        const count = await js('fixtures.contexts.length');
        await js('window.CueListening.toggle()');
        await until(() => meterState('you').then(state=>state==='active'), 'microphone works while meeting audio is opted out');
        assert.equal(await meterState('them'), 'disabled');
        assert.equal(await js('fixtures.contexts.length'), count + 1, 'meeting-audio opt-out does not open a loopback capture');
        await js('window.CueListening.toggle()');
      }
      await js('document.querySelector(\'#meeting-audio-seg [data-meeting-audio="on"]\').click(); window.cue.settingsSet({sttProvider:"openai",meetingAudio:true})');
      await js('navigator.mediaDevices.getDisplayMedia=async()=>{throw new DOMException("Synthetic denied call input","NotAllowedError")}; window.CueListening.toggle()');
      await until(() => meterState('you').then(state=>state==='active'), 'microphone survives a rejected system-audio permission');
      assert.equal(await meterState('them'), 'unavailable');
      await js('window.CueListening.toggle()');
      await js('navigator.mediaDevices.getDisplayMedia=fixtures.getCall; navigator.mediaDevices.getUserMedia=async()=>new MediaStream(); window.CueListening.toggle()');
      await until(() => meterState('them').then(state=>state==='active'), 'call audio survives a missing microphone');
      assert.equal(await meterState('you'), 'unavailable');
      await js('window.CueListening.toggle()');
      assert.equal(await meterState('you'), 'off'); assert.equal(await meterState('them'), 'off');
      await js('Promise.all(fixtures.contexts.map(ctx=>ctx.close()))');
      clearTimeout(deadline); console.log('PASS: real synthetic mic/loopback PCM and independent input meters (AudioWorklet + legacy), silence, mute/unmute, disabled/denied/missing inputs, stop/restart, minimum live-call layout, full live sentences, separate speaker previews, VAD commits, persisted history, stop tail, and Recap context.'); app.quit();
    } catch (error) { fail(error); }
  });
});
require('../main');
