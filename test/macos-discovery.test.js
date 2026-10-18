const test = require('node:test');
const assert = require('node:assert/strict');
const { createMacDiscovery } = require('../src/macos-discovery');

test('normal app registration imports only Cue and never runs administrator or disk-index commands', async () => {
  const calls = []; let version = '', queries = 0;
  const discovery = createMacDiscovery({ platform: 'darwin', isPackaged: true, bundlePath: '/Applications/cue.app', version: '0.3.0',
    readVersion: () => version, writeVersion: next => {version=next;},
    run: async (file,args) => { calls.push([file,args]); return file.endsWith('mdfind') && ++queries > 0 ? '/Applications/cue.app\n' : ''; }
  });
  const result = await discovery.refresh();
  assert.equal(result.indexed, true); assert.equal(version, '0.3.0');
  assert.ok(calls.some(([file,args]) => file.endsWith('mdimport') && args.join(' ') === '-i /Applications/cue.app'));
  assert.doesNotMatch(JSON.stringify(calls), /sudo|mdutil|tccutil|killall/);
  calls.length=0; await discovery.refresh(); assert.equal(calls.length,1,'current indexed builds only check their existing entry');
});

test('indexing delays and unavailable metadata services never become a startup failure', async () => {
  const waiting = createMacDiscovery({ platform:'darwin',isPackaged:true,bundlePath:'/Applications/cue.app',version:'0.3.0',readVersion:()=>'',writeVersion:()=>{},run:async()=>'' });
  assert.equal((await waiting.refresh()).indexed,false);
  const failed = createMacDiscovery({ platform:'darwin',isPackaged:true,bundlePath:'/Applications/cue.app',version:'0.3.0',readVersion:()=>'',writeVersion:()=>{},run:async()=>{throw new Error('service failed');} });
  assert.match((await failed.refresh()).message,/could not refresh/);
});

test('development and non-macOS builds never register Electron or touch a system index', async () => {
  for (const options of [{platform:'win32',isPackaged:true},{platform:'darwin',isPackaged:false}]) {
    let called=false;
    const discovery=createMacDiscovery({...options,bundlePath:'/Applications/Electron.app',run:async()=>{called=true;}});
    assert.equal((await discovery.refresh()).available,false); assert.equal(called,false);
  }
});
