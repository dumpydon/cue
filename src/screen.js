// Bounded screen capture with one native capture fallback per display source.
const { desktopCapturer, screen, nativeImage } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { waitWithSignal } = require('./answer-run');
const MAX_LONG_EDGE_PX = 1568;
const JPEG_QUALITY = 70;
const MAX_DATA_URL_BYTES = 3 * 1024 * 1024;
const CAPTURE_TIMEOUT_MS = 8000;

function captureError(message, code = 'SCREEN_CAPTURE_FAILED') { return Object.assign(new Error(message), { code }); }
function encodeScreenshot(img, { maxLongEdge = MAX_LONG_EDGE_PX, quality = JPEG_QUALITY } = {}) {
  const { width, height } = img.getSize();
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw captureError('The screen capture was empty.');
  let out = width > maxLongEdge || height > maxLongEdge
    ? img.resize(width >= height ? { width: maxLongEdge } : { height: maxLongEdge }) : img;
  for (let attempt = 0; attempt < 6; attempt++) {
    const jpeg = out.toJPEG(Math.max(45, quality - attempt * 5));
    if (!jpeg?.length) throw captureError('The screen capture could not be encoded.');
    const data = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    if (Buffer.byteLength(data) <= MAX_DATA_URL_BYTES) return data;
    const size = out.getSize();
    out = size.width >= size.height ? out.resize({ width: Math.max(320, Math.floor(size.width * .8)) })
      : out.resize({ height: Math.max(320, Math.floor(size.height * .8)) });
  }
  throw captureError('The screen image is too large. Try a smaller display or type the question.');
}

function captureMacNative({ signal } = {}) {
  return new Promise(resolve => {
    const tmpPath = path.join(os.tmpdir(), `cue_capture_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
    // -m captures only the main display, avoiding extra untracked PNGs on a
    // multi-monitor Mac. Other displays use explicit Electron display IDs.
    execFile('/usr/sbin/screencapture', ['-x', '-m', '-t', 'png', tmpPath], { timeout: 4000, signal }, error => {
      let image = null;
      try {
        if (!error && fs.existsSync(tmpPath)) {
          const candidate = nativeImage?.createFromPath?.(tmpPath);
          if (candidate && !candidate.isEmpty()) image = candidate;
        }
      } catch { /* A failed native capture can use the Electron fallback. */ }
      finally { fs.unlink(tmpPath, () => resolve(image)); }
    });
  });
}

function createScreenCapture({ platform = process.platform, displays = screen, capturer = desktopCapturer,
  nativeCapture = captureMacNative, timeoutMs = CAPTURE_TIMEOUT_MS } = {}) {
  let fallbackPending = null;
  return async function capture({ signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    if (signal?.aborted) throw signal.reason;
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(captureError('Screen capture timed out. Type the question or try again.', 'SCREEN_CAPTURE_TIMEOUT')), timeoutMs);
    try {
      const primary = displays.getPrimaryDisplay();
      const target = displays.getDisplayNearestPoint && displays.getCursorScreenPoint
        ? displays.getDisplayNearestPoint(displays.getCursorScreenPoint()) : primary;
      if (platform === 'darwin' && String(target.id) === String(primary.id)) {
        const image = await waitWithSignal(nativeCapture({ signal: controller.signal }), controller.signal);
        if (image) return encodeScreenshot(image);
      }
      if (fallbackPending) throw captureError('A screen capture is still finishing. Try again in a moment.', 'SCREEN_CAPTURE_BUSY');
      const size = target.size || target.bounds, ratio = Math.min(1, MAX_LONG_EDGE_PX / Math.max(size.width, size.height));
      // Do not allocate full Retina thumbnails for every connected monitor.
      const pending = Promise.resolve(capturer.getSources({ types: ['screen'], thumbnailSize: {
        width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio))
      } }));
      fallbackPending = pending;
      pending.then(() => { if (fallbackPending === pending) fallbackPending = null; },
        () => { if (fallbackPending === pending) fallbackPending = null; });
      const sources = await waitWithSignal(pending, controller.signal);
      const source = sources.find(s => String(s.display_id) === String(target.id)) || (sources.length === 1 ? sources[0] : null);
      if (!source?.thumbnail || source.thumbnail.isEmpty()) throw captureError('No usable screen image was available. Check Screen Recording access or type the question.');
      return encodeScreenshot(source.thumbnail);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}
const captureScreenshot = createScreenCapture();
module.exports = { captureScreenshot, createScreenCapture, encodeScreenshot, captureMacNative,
  MAX_LONG_EDGE_PX, JPEG_QUALITY, MAX_DATA_URL_BYTES, CAPTURE_TIMEOUT_MS };
