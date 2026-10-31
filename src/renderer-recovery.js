// Recover isolated renderer failures without an endless reload/crash loop.
function createRendererRecovery({ recover, exhausted, now = Date.now, schedule = setTimeout, clear = clearTimeout,
  maxAttempts = 2, windowMs = 60000, delayMs = 500 }) {
  let attempts = [], timer = null, disposed = false;
  return {
    crashed() {
      if (disposed || timer) return;
      attempts = attempts.filter(time => now() - time < windowMs);
      if (attempts.length >= maxAttempts) { exhausted(); return; }
      attempts.push(now());
      timer = schedule(() => { timer = null; if (!disposed) recover(); }, delayMs);
    },
    dispose() { disposed = true; if (timer) clear(timer); timer = null; },
  };
}
module.exports = { createRendererRecovery };
