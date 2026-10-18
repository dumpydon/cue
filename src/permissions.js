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

module.exports = { readPermissionStatus, requestCapturePermissions };
