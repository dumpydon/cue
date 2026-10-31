const MAX_QUEUED_AUDIO_BYTES = 16000 * 2 * 20;
const MAX_PCM_FRAME_BYTES = 16000 * 2 * 4;
const bytes = Symbol('queued PCM bytes');
function pcmFrame(value) {
  if (!(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) return null;
  const size = value.byteLength;
  if (!size || size % 2 || size > MAX_PCM_FRAME_BYTES) return null;
  return value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, size);
}
function queuePCM(chunks, chunk, limit = MAX_QUEUED_AUDIO_BYTES) {
  let total = chunks[bytes] ?? chunks.reduce((sum, item) => sum + item.length, 0);
  chunks.push(chunk); total += chunk.length;
  let dropped = 0;
  while (total > limit && chunks.length) { const first = chunks.shift(); total -= first.length; dropped += first.length; }
  chunks[bytes] = total; return dropped;
}
module.exports = { pcmFrame, queuePCM, MAX_QUEUED_AUDIO_BYTES, MAX_PCM_FRAME_BYTES };
