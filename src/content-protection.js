function protectionCapability({ platform, windowsSupported = true, localConsole = true, forceVisible = false }) {
  let reason = '';
  if (forceVisible) reason = 'Screen-share protection is disabled for this debug session.';
  else if (platform !== 'darwin' && platform !== 'win32') reason = 'Screen-share protection is unavailable on this platform.';
  else if (platform === 'win32' && !windowsSupported) reason = 'Screen-share protection requires Windows 10 version 2004 or newer.';
  else if (platform === 'win32' && !localConsole) reason = 'Screen-share protection is disabled in this remote desktop session.';
  return { available: !reason, reason, bestEffort: platform === 'darwin' };
}

// Electron 33 has no isContentProtected getter. Track successfully applied
// native calls, and roll every window back if applying or saving fails.
function createProtectionController({ capability, getWindows, readPreference, writePreference }) {
  let enabled = false;
  function state() { return { ...capability, enabled }; }
  function applyToWindow(window) {
    const next = capability.available && readPreference() !== false;
    if (capability.available) window.setContentProtection(next);
    enabled = next;
    return state();
  }
  function setEnabled(next) {
    if (typeof next !== 'boolean') throw new Error('Screen-share protection must be on or off.');
    if (next && !capability.available) throw new Error(capability.reason);
    const previous = enabled;
    const windows = getWindows().filter(window => !window.isDestroyed());
    try {
      if (capability.available) for (const window of windows) window.setContentProtection(next);
      writePreference(next);
      enabled = next;
      return state();
    } catch (error) {
      if (capability.available) for (const window of windows) {
        try { if (!window.isDestroyed()) window.setContentProtection(previous); } catch (_) {}
      }
      throw error;
    }
  }
  return { state, applyToWindow, setEnabled };
}

module.exports = { protectionCapability, createProtectionController };
