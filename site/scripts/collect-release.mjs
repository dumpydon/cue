// GitHub Actions downloads only exact public, checksum-verified preview files.
// Its GITHUB_TOKEN is used by gh, never by this script or the public website.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const release=JSON.parse(await readFile(path.join(site,'release.json'),'utf8'));
if(release.status!=='developer-preview'||!Object.keys(release.assets||{}).length){console.log('No ready developer preview to publish.');process.exit(0);}
if(release.notarized!==false||release.appleDeveloperId!==false||release.signing!=='local-development')throw Error('Unexpected developer-preview signing declaration');
const directory=path.resolve(site,'../.cache/release-publish');await mkdir(directory,{recursive:true});
const sums=[];
for(const [architecture,asset]of Object.entries(release.assets)){
  if(!['arm64','x64'].includes(architecture)||!/^cue-[a-zA-Z0-9._-]+\.zip$/.test(asset.filename)||!Number.isSafeInteger(asset.bytes)||asset.bytes<=0||asset.bytes>2*1024**3||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Invalid preview manifest');
  const destination=path.join(directory,asset.filename);
  const url=new URL(asset.url,'https://cue.dumpydon.workers.dev');
  if(url.origin!=='https://cue.dumpydon.workers.dev'||!/^\/get\/mac\/(arm64|x64)$/.test(url.pathname))throw Error('Unapproved artifact source');
  const output=createWriteStream(destination),hash=createHash('sha256');let bytes=0;
  const sources=asset.host==='worker-preview'&&asset.parts?.length
    ?asset.parts.map(part=>({...part,url:new URL(part.path,url.origin)}))
    :[{url,bytes:asset.bytes,sha256:asset.sha256}];
  try{for(const source of sources){
    if(source.url.origin!==url.origin||source.url.pathname.includes('..'))throw Error('Unapproved artifact piece');
    const response=await fetch(source.url,{signal:AbortSignal.timeout(300000)});if(!response.ok||!response.body)throw Error('Preview unavailable: '+response.status);
    const partHash=createHash('sha256');let partBytes=0;
    for await(const chunk of response.body){bytes+=chunk.length;partBytes+=chunk.length;if(bytes>asset.bytes||partBytes>source.bytes)throw Error('Unexpected artifact size');hash.update(chunk);partHash.update(chunk);if(!output.write(chunk))await new Promise(resolve=>output.once('drain',resolve));}
    if(partBytes!==source.bytes||partHash.digest('hex')!==source.sha256)throw Error('Preview piece integrity verification failed');
  }}
  finally{await new Promise((resolve,reject)=>output.end(error=>error?reject(error):resolve()));}
  if(bytes!==asset.bytes||hash.digest('hex')!==asset.sha256)throw Error('Preview integrity verification failed');
  sums.push(asset.sha256+'  '+asset.filename);console.log('Verified '+asset.filename+' ('+(await stat(destination)).size+' bytes)');
}
await writeFile(path.join(directory,'SHA256SUMS.txt'),sums.join('\n')+'\n');
const highlights=Array.isArray(release.highlights)?release.highlights.filter(item=>typeof item==='string'&&item.trim()).map(item=>'- '+item.trim()).join('\n'):'';
await writeFile(path.join(directory,'release-notes.md'),`# Cue ${release.version} — Developer Preview\n\nThis is a clean, locally certificate-signed developer preview. **It is not signed with an Apple Developer ID and is not Apple-notarized.** macOS may block the first launch. Read the [installation guide](https://cue.dumpydon.workers.dev/install/) before downloading.\n\nThe app is free and open source; your chosen AI providers may charge for usage. macOS 14.4+ is recommended for the complete meeting-audio experience. A local Whisper model must be downloaded separately.\n\n${highlights?'## Changes\n\n'+highlights+'\n\n':''}Source: https://github.com/dumpydon/cue/commit/${release.sourceCommit}\n\nIntegrity: use the included SHA256SUMS.txt. No local user settings, API keys, sessions, or private signing material are included.\n`);
