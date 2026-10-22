const test = require('node:test');
const assert = require('node:assert/strict');
const { measurePCM, createActivity } = require('../renderer/audio-activity');

const pcm = (value, length = 960) => new Int16Array(length).fill(value).buffer;
function setup() {
  let now = 0, nextTimer = 0;
  const pending = new Map(), latest = {}, changes = [];
  const timers = {
    setTimeout(fn, delay) { const id = ++nextTimer; pending.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { pending.delete(id); }
  };
  const meter = createActivity({ timers, onChange(channel, snapshot) { latest[channel] = snapshot; changes.push({ channel, ...snapshot }); } });
  const inputs = Object.fromEntries(['you', 'them'].map(channel => {
    const track = Object.assign(new EventTarget(), { readyState: 'live', enabled: true, muted: false });
    const context = Object.assign(new EventTarget(), { state: 'running' });
    meter.connect(channel, track, context);
    return [channel, { track, context }];
  }));
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...pending]) if (timer.at <= now) { pending.delete(id); timer.fn(); }
  }
  return { meter, latest, changes, pending, inputs, advance };
}

test('PCM levels ignore silence and low noise, preserve real envelope, and bound clipping', () => {
  for (const input of [null, new ArrayBuffer(1), pcm(0), pcm(30)]) {
    assert.deepEqual(measurePCM(input), { level: 0, bands: [0, 0, 0, 0, 0] });
  }
  assert.ok(measurePCM(pcm(4000)).level > measurePCM(pcm(500)).level);
  const samples = new Int16Array(1000);
  samples.fill(4000, 400, 600);
  const result = measurePCM(samples);
  assert.ok(result.level > 0);
  assert.ok(result.bands[2] > 0);
  assert.deepEqual([result.bands[0], result.bands[1], result.bands[3], result.bands[4]], [0, 0, 0, 0]);
  assert.equal(measurePCM(pcm(-32768)).level, 1);
});

test('each source follows only its own PCM, with distinct waveform and history shapes', () => {
  const h = setup(); h.meter.setSessionActive(true);
  h.meter.pushPCM('you', pcm(4000));
  assert.equal(h.latest.you.state, 'active');
  assert.ok(h.latest.you.bars[2] > h.latest.you.bars[0]);
  assert.equal(h.latest.them.state, 'ready');
  assert.ok(h.latest.them.bars.every(value => value === 0));
  h.meter.pushPCM('them', pcm(4000));
  assert.equal(h.latest.them.state, 'active');
  assert.equal(h.latest.them.bars[0], 0);
  assert.ok(h.latest.them.bars[4] > 0);
  h.meter.pushPCM('you', pcm(0));
  assert.equal(h.latest.you.state, 'ready');
  assert.ok(h.latest.you.bars.every(value => value === 0));
  assert.equal(h.latest.them.state, 'active');
  for (let i = 0; i < 5; i++) h.meter.pushPCM('them', pcm(0));
  assert.equal(h.latest.them.state, 'ready');
  assert.ok(h.latest.them.bars.every(value => value === 0));
  assert.equal(h.pending.size, 0, 'quiet inputs need no render loop or timer');
  h.meter.destroy();
});

test('a stalled channel settles while the other channel continues receiving audio', () => {
  const h = setup(); h.meter.setSessionActive(true);
  h.meter.pushPCM('you', pcm(4000)); h.meter.pushPCM('them', pcm(4000));
  h.advance(300); h.meter.pushPCM('them', pcm(4000)); h.advance(151);
  assert.equal(h.latest.you.state, 'ready');
  assert.ok(h.latest.you.bars.every(value => value === 0));
  assert.equal(h.latest.them.state, 'active');
  h.advance(300);
  assert.equal(h.latest.them.state, 'ready');
  assert.ok(h.latest.them.bars.every(value => value === 0));
  assert.equal(h.pending.size, 0);
  h.meter.destroy();
});

test('mute, disabled tracks, suspended contexts and unplugging cannot display activity', () => {
  const h = setup(); h.meter.setSessionActive(true);
  const { track, context } = h.inputs.you;
  h.meter.pushPCM('you', pcm(4000));
  track.muted = true; track.dispatchEvent(new Event('mute'));
  assert.equal(h.latest.you.state, 'muted');
  assert.ok(h.latest.you.bars.every(value => value === 0));
  h.meter.pushPCM('you', pcm(4000));
  assert.equal(h.latest.you.state, 'muted');
  track.muted = false; track.dispatchEvent(new Event('unmute'));
  assert.equal(h.latest.you.state, 'ready');
  track.enabled = false; h.meter.pushPCM('you', pcm(4000));
  assert.equal(h.latest.you.state, 'muted');
  track.enabled = true; context.state = 'suspended'; context.dispatchEvent(new Event('statechange'));
  h.meter.pushPCM('you', pcm(4000));
  assert.equal(h.latest.you.state, 'paused');
  context.state = 'running'; context.dispatchEvent(new Event('statechange'));
  h.meter.pushPCM('you', pcm(4000));
  assert.equal(h.latest.you.state, 'active');
  track.readyState = 'ended'; track.dispatchEvent(new Event('ended'));
  assert.equal(h.latest.you.state, 'unavailable');
  assert.ok(h.latest.you.bars.every(value => value === 0));
  assert.equal(h.latest.them.state, 'ready');
  h.meter.destroy();
});

test('session end clears both sources immediately and ignores late PCM', () => {
  const h = setup();
  h.meter.pushPCM('you', pcm(4000)); assert.equal(h.latest.you.state, 'off');
  h.meter.setSessionActive(true);
  for (const channel of ['you', 'them']) h.meter.pushPCM(channel, pcm(4000));
  h.meter.setSessionActive(false);
  h.meter.pushPCM('you', pcm(4000)); h.advance(1000);
  for (const channel of ['you', 'them']) {
    assert.equal(h.latest[channel].state, 'off');
    assert.ok(h.latest[channel].bars.every(value => value === 0));
  }
  assert.equal(h.pending.size, 0);
  h.meter.setSessionActive(true);
  assert.equal(h.latest.you.state, 'ready');
  assert.ok(h.latest.you.bars.every(value => value === 0));
  h.meter.destroy();
});

test('unavailable sources and old input listeners cannot revive a meter', () => {
  const h = setup(); h.meter.setSessionActive(true);
  h.meter.setSource('them', 'disabled');
  h.meter.pushPCM('them', pcm(4000));
  h.inputs.them.track.dispatchEvent(new Event('unmute'));
  assert.equal(h.latest.them.state, 'disabled');
  h.meter.setSource('you', 'starting'); assert.equal(h.latest.you.state, 'starting');
  h.meter.setSource('you', 'unavailable');
  h.meter.pushPCM('you', pcm(4000)); assert.equal(h.latest.you.state, 'unavailable');
  h.meter.connect('you', h.inputs.you.track, h.inputs.you.context);
  h.meter.pushPCM('you', pcm(4000)); assert.equal(h.latest.you.state, 'active');
  h.meter.destroy(); const count = h.changes.length;
  h.inputs.you.track.dispatchEvent(new Event('mute'));
  h.meter.pushPCM('you', pcm(4000)); h.advance(1000);
  assert.equal(h.changes.length, count);
  assert.equal(h.pending.size, 0);
});
