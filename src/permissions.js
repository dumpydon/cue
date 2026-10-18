// Preflight only: checking status must never capture the desktop or prompt.
// macOS may cache a denied result until the app has restarted.
function readPermissionStatus(systemPreferences, platform = process.platform) {
  if (platform !== 'darwin' && platform !== 'win32') return { mic: 'granted', screen: 'granted' };
  return {
    mic: systemPreferences.getMediaAccessStatus('microphone'),
    screen: platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
  };
}

// Called only by an explicit request, never startup or Check Again.
async function requestCapturePermissions({ systemPreferences, desktopCapturer, platform = process.platform }) {
  if (platform === 'darwin') {
    let status = readPermissionStatus(systemPreferences, platform);
    if (status.mic !== 'granted') await systemPreferences.askForMediaAccess('microphone');
    status = readPermissionStatus(systemPreferences, platform);
    if (status.screen !== 'granted') {
      try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); } catch (_) {}
    }
  }
  return readPermissionStatus(systemPreferences, platform);
}

const SCREEN_REPAIR_SWITCH = 'cue-request-screen-after-repair';
function relaunchArgs(argv, requestScreen = false) {
  const flag = '--' + SCREEN_REPAIR_SWITCH;
  const args = argv.slice(1).filter(arg => arg !== flag && !arg.startsWith(flag + '='));
  if (requestScreen) args.push(flag);
  return args;
}

module.exports = { readPermissionStatus, requestCapturePermissions, SCREEN_REPAIR_SWITCH, relaunchArgs };

// Reset only Cue's stale screen grant after an explicit repair action. Never
// run this on startup, status checks, or a development Electron profile.
function createScreenPermissionRepair({ platform, isPackaged, bundleId, stopCapture, run, restart }) {
  const available = platform === 'darwin' && isPackaged && bundleId === 'com.cue.overlay';
  let pending = null;
  return {
    available,
    repair() {
      if (!available) return Promise.reject(new Error('Screen permission repair is available in the installed macOS Cue app.'));
      if (pending) return pending;
      pending = (async () => {
        await stopCapture();
        await run('/usr/bin/tccutil', ['reset', 'ScreenCapture', 'com.cue.overlay']);
        await restart();
        return { restarting: true };
      })().finally(() => { pending = null; });
      return pending;
    }
  };
}

module.exports.createScreenPermissionRepair = createScreenPermissionRepair;
