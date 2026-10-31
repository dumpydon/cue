const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const sockets = [];
class Socket extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.sent = []; sockets.push(this); }
  send(text) { this.sent.push(JSON.parse(text)); }
  close(code) { this.readyState = 3; this.emit('close', code); }
}
const wsPath = require.resolve('ws');
require.cache[wsPath] = { id: wsPath, filename: wsPath, loaded: true, exports: Socket };
const { OpenAIRealtimeSTT } = require('../src/stt-streaming');
const { AdaptiveVAD } = require('../src/vad');
async function setup() {
  const finals = [], interims = [], statuses = [];
  const stt = new OpenAIRealtimeSTT('synthetic-key', { onTranscript: text => finals.push(text), onInterim: text => interims.push(text), onStatusChange: status => statuses.push(status) });
  await stt.connect(); const ws = sockets.at(-1); ws.emit('open');
  return { stt, ws, finals, interims, statuses, event: event => stt._handleEvent(event) };
}
const delta = (id, text) => ({ type: 'conversation.item.input_audio_transcription.delta', item_id: id, delta: text });
const final = (id, text) => ({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text });
function tone(samples) { const buffer = Buffer.alloc(samples * 2); for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(3000 * Math.sin(i / 10)), i * 2); return buffer; }

test('OpenAI deltas accumulate into complete live sentences and finals are deduplicated', async () => {
  const h = await setup();
  for (const text of ['Tell me', ' about', ' your project.']) h.event(delta('first', text));
  assert.deepEqual(h.interims.slice(-3), ['Tell me', 'Tell me about', 'Tell me about your project.']);
  h.event(final('first', 'Tell me about your project.'));
  h.event(final('first', 'Tell me about your project.'));
  assert.deepEqual(h.finals, ['Tell me about your project.']); assert.equal(h.interims.at(-1), ''); h.stt.disconnect();
});
test('out-of-order completions retain speech order and do not clear a newer partial', async () => {
  const h = await setup();
  h.event({ type: 'input_audio_buffer.committed', item_id: 'a' });
  h.event({ type: 'input_audio_buffer.committed', item_id: 'b' });
  h.event(delta('a', 'First sentence.')); h.event(delta('b', 'Second sentence.'));
  h.event(final('b', 'Second sentence.')); assert.deepEqual(h.finals, []);
  h.event(final('a', 'First sentence.')); assert.deepEqual(h.finals, ['First sentence.', 'Second sentence.']); h.stt.disconnect();
});
test('audio waits for session.updated and client VAD commits speech once after silence', async () => {
  const h = await setup(); const config = h.ws.sent[0];
  assert.equal(config.session.audio.input.turn_detection, null);
  h.stt.sendAudio(tone(16000)); h.event({ type: 'session.created' });
  assert.equal(h.ws.sent.filter(e => e.type === 'input_audio_buffer.append').length, 0);
  h.event({ type: 'session.updated' });
  h.stt.sendAudio(Buffer.alloc(32000)); h.stt.sendAudio(Buffer.alloc(32000));
  assert.equal(h.ws.sent.filter(e => e.type === 'input_audio_buffer.commit').length, 1);
  assert.equal(h.statuses.at(-1), 'connected'); h.stt.disconnect();
});
test('stop commits the last sentence and waits for its final before closing the socket', async () => {
  const h = await setup(); h.event({ type: 'session.updated' }); h.stt.sendAudio(tone(8000));
  h.event(delta('tail', 'We will deliver on Friday.'));
  const stopping = h.stt.stop();
  assert.equal(h.ws.readyState, 1);
  setTimeout(() => h.event(final('tail', 'We will deliver on Friday.')), 10);
  await stopping;
  assert.deepEqual(h.finals, ['We will deliver on Friday.']); assert.equal(h.ws.readyState, 3);
});
test('disconnect retains recognized text without duplicating already completed turns', async () => {
  const h = await setup(); h.event(delta('a', 'Finished.')); h.event(final('a', 'Finished.'));
  h.event(delta('b', 'A last partial sentence')); h.stt.disconnect(); h.stt.disconnect();
  assert.deepEqual(h.finals, ['Finished.', 'A last partial sentence']);
});
test('VAD retains samples split across sub-frame PCM chunks', () => {
  let ends = 0; const vad = new AdaptiveVAD({ onSpeechEnd: () => ends++ });
  const pcm = Buffer.concat([tone(16000), Buffer.alloc(32000)]);
  for (let i = 0; i < pcm.length; i += 256) vad.processChunk(pcm.subarray(i, i + 256));
  assert.equal(ends, 1);
});

test('one failed speech segment cannot block later completed sentences',async()=>{
 const h=await setup();const errors=[];h.stt.onError=error=>errors.push(error);
 h.event({type:'input_audio_buffer.committed',item_id:'bad'});h.event({type:'input_audio_buffer.committed',item_id:'good'});
 h.event(delta('bad','Unreliable partial'));h.event(final('good','The next question is about Redis.'));
 assert.deepEqual(h.finals,[]);
 h.event({type:'conversation.item.input_audio_transcription.failed',item_id:'bad',error:{code:'transcription_failed',message:'One segment failed'}});
 assert.deepEqual(h.finals,['The next question is about Redis.']);assert.equal(errors[0].recoverable,true);assert.equal(h.interims.at(-1),'');
 h.event(final('bad','Late invalid duplicate'));assert.equal(h.finals.length,1);h.stt.disconnect();
});

test('a congested speech socket cannot keep accepting an unbounded audio backlog',async()=>{
 const h=await setup();h.event({type:'session.updated'});const errors=[];h.stt.onError=error=>errors.push(error);
 h.ws.bufferedAmount=2*1024*1024;
 for(let i=0;i<50;i++)h.stt.sendAudio(tone(320));
 assert.equal(h.ws.sent.filter(e=>e.type==='input_audio_buffer.append').length,0);assert.equal(errors.length,1);assert.equal(errors[0].code,'STT_BACKPRESSURE');
 h.ws.bufferedAmount=0;h.stt.sendAudio(tone(320));assert.equal(h.ws.sent.filter(e=>e.type==='input_audio_buffer.append').length,1);h.stt.disconnect();
});
