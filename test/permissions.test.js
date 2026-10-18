const test = require('node:test');
const assert = require('node:assert/strict');
const { readPermissionStatus, requestCapturePermissions, createScreenPermissionRepair, relaunchArgs } = require('../src/permissions');

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

test('explicit repair resets only Cue screen access, stops capture first and restarts once', async () => {
  const calls = [];
  const repair = createScreenPermissionRepair({ platform:'darwin',isPackaged:true,bundleId:'com.cue.overlay',
    stopCapture:async()=>{calls.push('stop');},run:async(file,args)=>{calls.push([file,args]);},restart:async()=>{calls.push('restart');} });
  await Promise.all([repair.repair(),repair.repair()]);
  assert.deepEqual(calls,['stop',['/usr/bin/tccutil',['reset','ScreenCapture','com.cue.overlay']],'restart']);
});

test('repair is unavailable to development profiles and reset failures cannot trigger a restart', async () => {
  for (const options of [{platform:'linux',isPackaged:true,bundleId:'com.cue.overlay'},{platform:'darwin',isPackaged:false,bundleId:'com.cue.overlay'},{platform:'darwin',isPackaged:true,bundleId:'com.github.Electron'}]) {
    const repair=createScreenPermissionRepair({...options,run:()=>{throw new Error('unexpected');}});
    assert.equal(repair.available,false);await assert.rejects(repair.repair(),/installed macOS/);
  }
  let restarted=false;
  const repair=createScreenPermissionRepair({platform:'darwin',isPackaged:true,bundleId:'com.cue.overlay',stopCapture:async()=>{},run:async()=>{throw new Error('reset failed');},restart:async()=>{restarted=true;}});
  await assert.rejects(repair.repair(),/reset failed/);assert.equal(restarted,false);
});

test('the recovery request is consumed and ordinary restarts never repeat it', () => {
  const argv = ['/Applications/cue.app/Contents/MacOS/cue', '--inspect=127.0.0.1:9999', '--cue-request-screen-after-repair', '--cue-request-screen-after-repair=1'];
  assert.deepEqual(relaunchArgs(argv), ['--inspect=127.0.0.1:9999']);
  assert.deepEqual(relaunchArgs(argv, true), ['--inspect=127.0.0.1:9999', '--cue-request-screen-after-repair']);
});
