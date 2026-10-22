/* Local input meters. Observe the existing capture graph; never open a device. */
(function (root) {
  const CHANNELS = ['you', 'them'];
  const EMPTY = () => [0, 0, 0, 0, 0];
  function amplitude(rms) {
    // Keep the noise floor still, while making normal conversational levels visible.
    const db = 20 * Math.log10(Math.max(rms, 1e-6));
    return db <= -54 ? 0 : Math.min(1, (db + 54) / 42);
  }
  function measurePCM(buffer) {
    const samples = buffer instanceof Int16Array ? buffer
      : buffer instanceof ArrayBuffer && buffer.byteLength % 2 === 0 ? new Int16Array(buffer) : null;
    if (!samples?.length) return { level: 0, bands: EMPTY() };
    let total = 0;
    const sums = EMPTY(), counts = EMPTY();
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i] / 32768;
      const band = Math.min(4, Math.floor(i * 5 / samples.length));
      sums[band] += value * value; counts[band]++; total += value * value;
    }
    return { level: amplitude(Math.sqrt(total / samples.length)),
      bands: sums.map((sum, i) => amplitude(Math.sqrt(sum / (counts[i] || 1)))) };
  }

  function createActivity({ onChange = () => {}, timers = root } = {}) {
    let active = false, destroyed = false;
    const sources = Object.fromEntries(CHANNELS.map(channel => [channel, {
      status: 'unavailable', connection: null, timer: null, bars: EMPTY(), signal: false
    }]));
    function state(source) {
      if (!active) return 'off';
      const connection = source.connection;
      if (!connection) return source.status;
      if (connection.track.readyState !== 'live') return 'unavailable';
      if (connection.track.muted || !connection.track.enabled) return 'muted';
      if (connection.context.state !== 'running') return 'paused';
      return source.signal ? 'active' : 'ready';
    }
    function emit(channel) {
      if (!destroyed) onChange(channel, { state: state(sources[channel]), bars: [...sources[channel].bars] });
    }
    function clear(source) {
      if (source.timer !== null) timers.clearTimeout(source.timer);
      source.timer = null; source.signal = false; source.bars = EMPTY();
    }
    function detach(source) {
      source.connection?.dispose(); source.connection = null; clear(source);
    }
    function setSource(channel, status) {
      if (destroyed || !sources[channel] || !['starting', 'disabled', 'unavailable'].includes(status)) return;
      detach(sources[channel]); sources[channel].status = status; emit(channel);
    }
    function connect(channel, track, context) {
      if (destroyed || !sources[channel] || !track || !context) return;
      const source = sources[channel]; detach(source);
      const sync = () => {
        if (!['ready', 'active'].includes(state(source))) clear(source);
        emit(channel);
      };
      for (const event of ['mute', 'unmute', 'ended']) track.addEventListener(event, sync);
      context.addEventListener('statechange', sync);
      source.connection = { track, context, dispose: () => {
        for (const event of ['mute', 'unmute', 'ended']) track.removeEventListener(event, sync);
        context.removeEventListener('statechange', sync);
      } };
      sync();
    }
    function pushPCM(channel, buffer) {
      if (destroyed || !sources[channel]) return;
      const source = sources[channel];
      if (!['ready', 'active'].includes(state(source))) { clear(source); emit(channel); return; }
      const { level, bands } = measurePCM(buffer);
      source.signal = level > 0;
      // Mic: a centered waveform from five slices of this buffer. Call: a short
      // level history rising from a baseline. Neither uses random/fake motion.
      source.bars = channel === 'you'
        ? bands.map((value, i) => value * [0.5, 0.8, 1, 0.8, 0.5][i])
        : [...source.bars.slice(1), level];
      if (source.timer !== null) timers.clearTimeout(source.timer);
      source.timer = null;
      // A stalled input must settle even if it never emits another buffer.
      // 450 ms also accommodates the 256 ms legacy ScriptProcessor chunks.
      if (source.bars.some(value => value > 0)) source.timer = timers.setTimeout(() => {
        clear(source); emit(channel);
      }, 450);
      emit(channel);
    }
    function setSessionActive(value) {
      if (destroyed || active === !!value) return;
      active = !!value;
      for (const channel of CHANNELS) { clear(sources[channel]); emit(channel); }
    }
    for (const channel of CHANNELS) emit(channel);
    return { setSessionActive, setSource, connect, pushPCM, destroy() {
      for (const source of Object.values(sources)) detach(source);
      destroyed = true;
    } };
  }

  function install({ element, icon }) {
    const labels = { you: 'Your microphone', them: 'Call / system audio' };
    const descriptions = { off: 'Session off', starting: 'Connecting', disabled: 'Meeting audio is off in Settings',
      unavailable: 'No audio input available', muted: 'Input muted', paused: 'Audio input paused',
      ready: 'Listening · quiet', active: 'Audio detected' };
    const nodes = Object.fromEntries(CHANNELS.map(channel => {
      const node = element.querySelector(`[data-audio-channel="${channel}"]`);
      node.querySelector('.audio-source-icon').innerHTML = icon(channel === 'you' ? 'mic' : 'monitor', { size: 12, stroke: 1.7 });
      return [channel, { node, bars: [...node.querySelectorAll('.audio-bars i')] }];
    }));
    return createActivity({ onChange(channel, snapshot) {
      const { node, bars } = nodes[channel];
      if (node.dataset.state !== snapshot.state) {
        node.dataset.state = snapshot.state;
        node.title = `${labels[channel]}: ${descriptions[snapshot.state]}`;
        node.setAttribute('aria-label', node.title);
      }
      bars.forEach((bar, i) => { bar.style.height = `${(2 + snapshot.bars[i] * 12).toFixed(1)}px`; });
    } });
  }
  const api = { measurePCM, createActivity, install };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CueAudioActivity = api;
})(typeof window === 'object' ? window : globalThis);
