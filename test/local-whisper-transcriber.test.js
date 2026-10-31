const assert = require('node:assert/strict');
const test = require('node:test');
const { LocalWhisperTranscriber } = require('../src/local-whisper-transcriber');

test('serializes both channels through one persistent session', async () => {
  let activeInferences = 0;
  let maximumConcurrency = 0;
  const transcribedChannels = [];
  const transcripts = [];
  const fakeSession = {
    startCalls: 0,
    stopCalls: 0,
    async start() { this.startCalls += 1; },
    async transcribe(pcm) {
      activeInferences += 1;
      maximumConcurrency = Math.max(maximumConcurrency, activeInferences);
      await new Promise((resolve) => setImmediate(resolve));
      activeInferences -= 1;
      return pcm.toString();
    },
    abortInferences() {},
    async stop() { this.stopCalls += 1; }
  };

  const transcriber = new LocalWhisperTranscriber({
    sessionOptions: {},
    sessionFactory: () => fakeSession,
    segmenterFactory: (options) => ({
      push(pcm) {
        transcribedChannels.push(options.channel);
        options.onUtterance(options.channel, Buffer.from(pcm));
      },
      stop() {}
    }),
    onTranscript: (channel, text) => transcripts.push({ channel, text })
  });

  await transcriber.start();
  transcriber.push('you', Buffer.from('first'));
  transcriber.push('them', Buffer.from('second'));
  await transcriber.queueTail;
  await transcriber.stop();

  assert.equal(fakeSession.startCalls, 1);
  assert.equal(fakeSession.stopCalls, 1);
  assert.equal(maximumConcurrency, 1);
  assert.deepEqual(transcribedChannels, ['you', 'them']);
  assert.deepEqual(transcripts, [
    { channel: 'you', text: 'first' },
    { channel: 'them', text: 'second' }
  ]);
});

test('bounds shutdown drain time before aborting an in-flight inference', async () => {
  let rejectInference;
  const stopOptions = [];
  const reportedErrors = [];
  let abortCalls = 0;
  let transcribeCalls = 0;
  const fakeSession = {
    async start() {},
    async transcribe() {
      transcribeCalls += 1;
      return new Promise((_resolve, reject) => { rejectInference = reject; });
    },
    abortInferences() {
      abortCalls += 1;
      rejectInference(new Error('inference aborted'));
    },
    async stop(options) { stopOptions.push(options); }
  };
  const transcriber = new LocalWhisperTranscriber({
    sessionOptions: {},
    sessionFactory: () => fakeSession,
    segmenterFactory: (options) => ({
      push(pcm) { options.onUtterance(options.channel, Buffer.from(pcm)); },
      stop() {}
    }),
    drainTimeoutMs: 0,
    onError: (error) => reportedErrors.push(error)
  });

  await transcriber.start();
  transcriber.push('you', Buffer.from('pending'));
  transcriber.push('them', Buffer.from('discard me'));
  await transcriber.stop();
  await transcriber.queueTail;

  assert.equal(abortCalls, 1);
  assert.equal(transcribeCalls, 1);
  assert.deepEqual(reportedErrors, []);
  assert.deepEqual(stopOptions, [{ force: true }]);
});

test('slow local inference has a bounded queue and no late transcript after forced stop',async()=>{
 let release;const errors=[],texts=[];
 const local=new LocalWhisperTranscriber({maxPendingJobs:2,sessionOptions:{},sessionFactory:()=>({async start(){},transcribe:()=>new Promise(resolve=>{release=resolve;}),abortInferences(){},async stop(){}}),segmenterFactory:options=>({push:pcm=>options.onUtterance(options.channel,pcm),stop(){}}),onError:error=>errors.push(error),onTranscript:(_,text)=>texts.push(text)});
 await local.start();for(let i=0;i<1000;i++)local.push(i%2?'you':'them',Buffer.alloc(3200));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(local.pendingJobs,2);assert.equal(errors.length,1);assert.equal(errors[0].code,'LOCAL_AUDIO_BACKLOG');
 await local.forceStop();release('Late discarded transcript');await local.queueTail;
 assert.deepEqual(texts,[]);assert.equal(local.pendingJobs,0);
});
