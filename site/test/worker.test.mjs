import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, byteRange } from '../worker.mjs';
const bytes = new TextEncoder().encode('abcdefghij');
const sha256 = 'a'.repeat(64);
function fixture() {
  const calls=[];
  const parts=[{path:'/downloads/parts/0.4.14/arm64/part-001.bin',bytes:4},{path:'/downloads/parts/0.4.14/arm64/part-002.bin',bytes:6}];
  const env={ASSETS:{async fetch(request){
    const path=new URL(request.url).pathname;calls.push({path,range:request.headers.get('Range')});
    const source=path===parts[0].path?bytes.subarray(0,4):path===parts[1].path?bytes.subarray(4):null;
    if(!source)return new Response('page',{headers:{'Content-Type':'text/html'}});
    const range=byteRange(request.headers.get('Range'),source.length);
    return new Response(range?source.subarray(range.start,range.end+1):source,{status:range?206:200});
  }}};
  const manifest={assets:{arm64:{filename:'cue-0.4.14-preview-mac-arm64.zip',bytes:10,sha256,host:'worker-preview',parts}}};
  return{handler:createHandler(manifest),env,calls,manifest};
}
test('the preview streams exact bytes across asset boundaries',async()=>{
  const f=fixture(),response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64'),f.env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),'10');assert.match(response.headers.get('Content-Disposition'),/attachment/);
  assert.equal(await response.text(),'abcdefghij');assert.equal(f.calls.length,2);
});
test('resuming across two pieces preserves exact byte offsets',async()=>{
  const f=fixture(),response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64',{headers:{Range:'bytes=2-7'}}),f.env);
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 2-7/10');assert.equal(await response.text(),'cdefgh');
  assert.deepEqual(f.calls.map(call=>call.range),['bytes=2-3','bytes=0-3']);
});
test('HEAD does not fetch or buffer the application',async()=>{
  const f=fixture(),response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64',{method:'HEAD'}),f.env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),'10');assert.equal(await response.text(),'');assert.equal(f.calls.length,0);
});
test('range resumption also works when a static-asset origin returns full pieces',async()=>{
  const f=fixture(),fetchAsset=f.env.ASSETS.fetch;
  f.env.ASSETS.fetch=request=>fetchAsset(new Request(request.url));
  const response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64',{headers:{Range:'bytes=2-7'}}),f.env);
  assert.equal(response.status,206);assert.equal(await response.text(),'cdefgh');
});
test('invalid ranges fail explicitly, while suffix and open ranges work',async()=>{
  assert.deepEqual(byteRange('bytes=-3',10),{start:7,end:9});assert.deepEqual(byteRange('bytes=5-',10),{start:5,end:9});
  for(const range of ['bytes=99-','bytes=7-2','bytes=0-1,4-5','bytes=-0','invalid']){
    const f=fixture(),response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64',{headers:{Range:range}}),f.env);
    assert.equal(response.status,416);assert.equal(response.headers.get('Content-Range'),'bytes */10');assert.equal(f.calls.length,0);
  }
});
test('ETags and If-Range prevent mismatched partial downloads',async()=>{
  let f=fixture(),response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64',{headers:{'If-None-Match':'"'+sha256+'"'}}),f.env);
  assert.equal(response.status,304);assert.equal(f.calls.length,0);
  f=fixture();response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64',{headers:{Range:'bytes=2-4','If-Range':'"old"'}}),f.env);
  assert.equal(response.status,200);assert.equal(await response.text(),'abcdefghij');
});
test('missing architecture has a useful install route and untrusted part paths fail closed',async()=>{
  const f=fixture();let response=await f.handler.fetch(new Request('https://cue.example/get/mac/x64'),f.env);
  assert.equal(response.status,302);assert.equal(response.headers.get('Location'),'https://cue.example/install/');
  f.manifest.assets.arm64.parts[0].path='/downloads/parts/../private';
  response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64'),f.env);assert.equal(response.status,503);
});
test('published GitHub assets use only the exact Cue releases origin',async()=>{
  const f=fixture();f.manifest.assets.arm64.host='github';f.manifest.assets.arm64.releaseUrl='https://github.com/dumpydon/cue/releases/download/v0.4.14-preview.1/cue.zip';
  const response=await f.handler.fetch(new Request('https://cue.example/get/mac/arm64'),f.env);assert.equal(response.status,302);assert.equal(response.headers.get('Location'),f.manifest.assets.arm64.releaseUrl);assert.equal(f.calls.length,0);
});
test('the public website is read-only and denies capture permissions in browsers',async()=>{
  const f=fixture();let response=await f.handler.fetch(new Request('https://cue.example/',{method:'POST'}),f.env);assert.equal(response.status,405);
  response=await f.handler.fetch(new Request('https://cue.example/'),f.env);assert.equal(response.status,200);assert.match(response.headers.get('Permissions-Policy'),/microphone=\(\)/);assert.match(response.headers.get('Content-Security-Policy'),/script-src 'self'/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
});
test('film seeking receives correct partial bytes when the static binding ignores Range', async () => {
  const handler = createHandler({ assets: {} });
  const env = { ASSETS: { fetch: async () => new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length), ETag: '"film"' } }) } };
  let response = await handler.fetch(new Request('https://cue.example/media/cue-launch.mp4', { headers: { Range: 'bytes=2-5' } }), env);
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10'); assert.equal(await response.text(), 'cdef');
  response = await handler.fetch(new Request('https://cue.example/media/cue-launch.mp4', { headers: { Range: 'bytes=50-' } }), env);
  assert.equal(response.status, 416);
  response = await handler.fetch(new Request('https://cue.example/media/cue-launch.mp4', { headers: { Range: 'bytes=2-5', 'If-Range': '"old-film"' } }), env);
  assert.equal(response.status, 200); assert.equal(await response.text(), 'abcdefghij');
});
test('film seeking also works when the asset binding omits Content-Length', async () => {
  const handler = createHandler({ assets: {} });
  const env = { ASSETS: { fetch: async () => new Response(bytes, { headers: { 'Content-Type': 'video/mp4' } }) } };
  const response = await handler.fetch(new Request('https://cue.example/media/cue-launch.mp4', { headers: { Range: 'bytes=2-5' } }), env);
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Length'), '4'); assert.equal(await response.text(), 'cdef');
});
