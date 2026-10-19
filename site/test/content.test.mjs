import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('the film range metadata matches the exact published movie', async () => {
  const metadata = JSON.parse(await fs.readFile(path.join(site, 'film.json'), 'utf8'));
  const bytes = await fs.readFile(path.join(site, 'public', metadata.path));
  assert.equal(bytes.length, metadata.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
});
test('public navigation and media references resolve to built local files',async()=>{
  const publicRoot=path.join(site,'public');
  for(const name of ['index.html','privacy/index.html','install/index.html','404.html']){
    const html=await fs.readFile(path.join(publicRoot,name),'utf8');
    for(const [,reference] of html.matchAll(/(?:src|href)="(\/[^"?#]*)"/g)){
      if(reference==='/release.json'||reference.startsWith('/get/'))continue;
      const target=path.join(publicRoot,reference.endsWith('/')?reference+'index.html':reference);
      assert.ok((await fs.stat(target)).isFile(),name+': '+reference);
    }
    assert.ok(!/\son(?:click|load|error)=/i.test(html),'no inline JavaScript handlers');
  }
});
test('the site offers a real non-JavaScript installation path and film fallback',async()=>{
  const html=await fs.readFile(path.join(site,'public/index.html'),'utf8');
  const ctas=[...html.matchAll(/<a\b([^>]*data-download[^>]*)>/g)];
  assert.ok(ctas.length>=3);assert.ok(ctas.every(([,attrs])=>attrs.includes('href="/install/"')));
  assert.match(html,/<video[^>]*controls/);assert.match(html,/\/media\/cue-launch\.mp4">Download the film/);
  assert.match(html,/best effort|Some macOS capture tools can still show/);
});
test('every ready release declares exact integrity and signing metadata',async()=>{
  const manifest=JSON.parse(await fs.readFile(path.join(site,'release.json'),'utf8'));
  for(const [architecture,asset]of Object.entries(manifest.assets)){
    assert.ok(['arm64','x64'].includes(architecture));assert.ok(Number.isSafeInteger(asset.bytes)&&asset.bytes>0);assert.match(asset.sha256,/^[a-f0-9]{64}$/);assert.match(asset.url,/^\/get\/mac\/(?:arm64|x64)$/);assert.match(asset.filename,/^cue-[a-zA-Z0-9._-]+\.zip$/);
    assert.equal(manifest.signing,'local-development');assert.equal(manifest.notarized,false);assert.equal(manifest.appleDeveloperId,false);assert.match(manifest.sourceCommit,/^[a-f0-9]{40}$/);
    if(asset.host==='worker-preview'){assert.ok(asset.parts.length);assert.equal(asset.parts.reduce((n,p)=>n+p.bytes,0),asset.bytes);for(const part of asset.parts){assert.ok(part.bytes>0&&part.bytes<=25*1024*1024);assert.match(part.sha256,/^[a-f0-9]{64}$/);}}
  }
});
