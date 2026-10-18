const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function processor() {
  const messages = []; let Processor;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/audio-worklet-processor.js'), 'utf8'), {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: data => messages.push(data) }; } },
    registerProcessor: (_name, implementation) => { Processor = implementation; }
  });
  return { node: new Processor(), messages };
}
test('meeting audio mixes both stereo channels instead of dropping right-only speech', () => {
  const { node, messages } = processor();
  node.process([[new Float32Array(960), new Float32Array(960).fill(.5)]]);
  const samples = new Int16Array(messages[0]); assert.equal(samples.length, 960);
  assert.ok(samples.every(sample => sample === 8191));
});
test('stop flushes a short final audio buffer before acknowledging completion', () => {
  const { node, messages } = processor(); node.process([[new Float32Array(128).fill(.25)]]);
  assert.equal(messages.length, 0); node.port.onmessage({ data: { type: 'flush' } });
  assert.equal(new Int16Array(messages[0]).length, 128); assert.equal(messages[1].type, 'flushed');
  node.port.onmessage({ data: { type: 'flush' } }); assert.equal(messages.length, 3);
  assert.equal(messages[2].type, 'flushed', 'repeated flush never duplicates samples');
});
