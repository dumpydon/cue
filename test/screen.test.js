const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

// screen.js requires electron at load time; stub it the way llm.test.js stubs
// the openai SDK so the encoder can be exercised without a display.
const originalModuleLoad = Module._load;
Module._load = function loadWithElectronStub(request, parent, isMain) {
  if (request === 'electron') return { desktopCapturer: {}, screen: {} };
  return originalModuleLoad.call(this, request, parent, isMain);
};
const { encodeScreenshot, MAX_LONG_EDGE_PX, JPEG_QUALITY, MAX_DATA_URL_BYTES } = require('../src/screen');
Module._load = originalModuleLoad;

// A stand-in for Electron's NativeImage. The JPEG size is modelled as a fixed
// number of bytes per pixel so that the *only* thing that can bring a large
// capture under the cap is the resize step this test is guarding.
const FAKE_JPEG_BYTES_PER_PIXEL = 0.5;
function fakeImage(width, height, log = []) {
  return {
    getSize: () => ({ width, height }),
    isEmpty: () => false,
    resize(opts) {
      log.push({ resize: opts });
      const aspect = width / height;
      const w = opts.width != null ? opts.width : Math.round(opts.height * aspect);
      const h = opts.height != null ? opts.height : Math.round(opts.width / aspect);
      return fakeImage(w, h, log);
    },
    toJPEG(quality) {
      log.push({ toJPEG: quality });
      return Buffer.alloc(Math.round(width * height * FAKE_JPEG_BYTES_PER_PIXEL), 1);
    }
  };
}

test('a 4K capture is resized to the 1568 px long edge and encoded as JPEG q70 under 3 MB', () => {
  const log = [];
  const url = encodeScreenshot(fakeImage(3840, 2160, log));

  assert.match(url, /^data:image\/jpeg;base64,/);
  assert.deepEqual(log[0], { resize: { width: MAX_LONG_EDGE_PX } });
  assert.deepEqual(log[1], { toJPEG: JPEG_QUALITY });
  assert.ok(Buffer.byteLength(url) < MAX_DATA_URL_BYTES, `data URL is ${Buffer.byteLength(url)} bytes`);
  assert.equal(MAX_LONG_EDGE_PX, 1568);
  assert.equal(JPEG_QUALITY, 70);
});

test('the unresized 4K capture would NOT fit — proves the resize is load-bearing', () => {
  const raw = fakeImage(3840, 2160);
  const url = `data:image/jpeg;base64,${raw.toJPEG(70).toString('base64')}`;
  assert.ok(Buffer.byteLength(url) > MAX_DATA_URL_BYTES);
});

test('a portrait capture is resized by its height', () => {
  const log = [];
  encodeScreenshot(fakeImage(1200, 2600, log));
  assert.deepEqual(log[0], { resize: { height: MAX_LONG_EDGE_PX } });
});

test('a small capture is never upscaled', () => {
  const log = [];
  encodeScreenshot(fakeImage(1280, 800, log));
  assert.deepEqual(log, [{ toJPEG: JPEG_QUALITY }]);
});

test('capture chooses the display under the pointer and allocates bounded thumbnails',async()=>{
 const {createScreenCapture}=require('../src/screen');let options;
 const capture=createScreenCapture({platform:'linux',displays:{getPrimaryDisplay:()=>({id:1,size:{width:1920,height:1080}}),getCursorScreenPoint:()=>({x:3000,y:100}),getDisplayNearestPoint:()=>({id:2,size:{width:5120,height:2880}})},capturer:{getSources:async value=>{options=value;return [{display_id:'1',thumbnail:fakeImage(100,100)},{display_id:'2',thumbnail:fakeImage(1568,882)}];}}});
 const result=await capture();assert.equal(options.thumbnailSize.width,1568);assert.equal(options.thumbnailSize.height,882);assert.ok(result.length>100000);
});
test('a hung capture times out and cannot accumulate overlapping native capture jobs',async()=>{
 const {createScreenCapture}=require('../src/screen');let release,calls=0;
 const capture=createScreenCapture({platform:'linux',timeoutMs:15,displays:{getPrimaryDisplay:()=>({id:1,size:{width:100,height:100}})},capturer:{getSources:()=>{calls++;return new Promise(resolve=>{release=resolve;});}}});
 await assert.rejects(capture(),{code:'SCREEN_CAPTURE_TIMEOUT'});
 await assert.rejects(capture(),{code:'SCREEN_CAPTURE_BUSY'});assert.equal(calls,1);
 release([{display_id:'1',thumbnail:fakeImage(10,10)}]);await new Promise(resolve=>setImmediate(resolve));
 const controller=new AbortController();const pending=capture({signal:controller.signal});controller.abort(new Error('stopped'));await assert.rejects(pending,/stopped/);
 release([]);
});
test('an unexpectedly large JPEG is reduced or rejected before entering a provider request',()=>{
 assert.throws(()=>encodeScreenshot({getSize:()=>({width:0,height:0})}),/empty/);
 const url=encodeScreenshot(fakeImage(1568,1568));assert.ok(Buffer.byteLength(url)<=MAX_DATA_URL_BYTES);
});
