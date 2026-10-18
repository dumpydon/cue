const test = require('node:test');
const assert = require('node:assert/strict');
const { readPermissionStatus, requestCapturePermissions } = require('../src/permissions');

test('repeated permission checks only read status and never request access', () => {
  const calls = [];
  const preferences = {
    getMediaAccessStatus: type => { calls.push(type); return type === 'screen' ? 'denied' : 'granted'; },
    askForMediaAccess: () => { throw new Error('A check must never prompt'); }
  };
  for (let i = 0; i < 4; i++) assert.deepEqual(readPermissionStatus(preferences, 'darwin'), { mic: 'granted', screen: 'denied' });
  assert.deepEqual(calls, ['microphone', 'screen', 'microphone', 'screen', 'microphone', 'screen', 'microphone', 'screen']);
});

test('an explicit request attempts each missing permission once, without retrying denied capture', async () => {
  const calls = [];
  const preferences = {
    getMediaAccessStatus: () => 'denied',
    askForMediaAccess: async type => { calls.push(type); return false; }
  };
  const result = await requestCapturePermissions({
    systemPreferences: preferences,
    desktopCapturer: { getSources: async () => { calls.push('screen'); throw new Error('Denied'); } },
    platform: 'darwin'
  });
  assert.deepEqual(calls, ['microphone', 'screen']);
  assert.deepEqual(result, { mic: 'denied', screen: 'denied' });
});

test('already granted permissions never trigger a new request or desktop capture', async () => {
  const unexpected = () => { throw new Error('Unexpected request'); };
  const result = await requestCapturePermissions({
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: unexpected },
    desktopCapturer: { getSources: unexpected }, platform: 'darwin'
  });
  assert.deepEqual(result, { mic: 'granted', screen: 'granted' });
});

test('Windows screen capture and Linux do not use macOS permission APIs', () => {
  assert.deepEqual(readPermissionStatus({ getMediaAccessStatus: type => { assert.equal(type, 'microphone'); return 'denied'; } }, 'win32'), { mic: 'denied', screen: 'granted' });
  assert.deepEqual(readPermissionStatus({}, 'linux'), { mic: 'granted', screen: 'granted' });
});
