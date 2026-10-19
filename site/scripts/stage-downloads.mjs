// Prepare exact, public preview artifacts for initial Worker delivery. The
// application files and intermediate pieces stay out of the source repository.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const staging = path.resolve(site, '../.cache/cue-site-downloads');
export const CHUNK_BYTES = 20 * 1024 * 1024;
export async function stageArtifact(file, architecture, sourceCommit) {
  if (!['arm64', 'x64'].includes(architecture)) throw Error('Choose arm64 or x64');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw Error('An exact committed source SHA is required');
  const manifest = JSON.parse(await readFile(path.join(site, 'release.json'), 'utf8'));
  const filename = path.basename(file);
  if (!/^cue-[a-zA-Z0-9._-]+\.zip$/.test(filename)) throw Error('Choose a versioned Cue ZIP');
  const info = await stat(file); if (!info.isFile() || info.size <= 0) throw Error('Preview ZIP is empty');
  const relative = `downloads/parts/${manifest.version}/${architecture}`;
  const directory = path.join(staging, relative); await rm(directory,{recursive:true,force:true}); await mkdir(directory,{recursive:true});
  const hash = createHash('sha256'), parts=[];
  let current=null, currentBytes=0, currentHash=null, partIndex=0;
  const closePart = async () => {
    if(!current)return;
    await new Promise((resolve,reject)=>current.end(error=>error?reject(error):resolve()));
    parts.push({path:`/${relative}/part-${String(partIndex).padStart(3,'0')}.bin`,bytes:currentBytes,sha256:currentHash.digest('hex')});
    current=null;currentBytes=0;
  };
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);let offset=0;
    while(offset<chunk.length){
      if(!current){partIndex++;current=createWriteStream(path.join(directory,`part-${String(partIndex).padStart(3,'0')}.bin`));currentHash=createHash('sha256');}
      const length=Math.min(chunk.length-offset,CHUNK_BYTES-currentBytes),slice=chunk.subarray(offset,offset+length);
      currentHash.update(slice);if(!current.write(slice))await new Promise(resolve=>current.once('drain',resolve));
      currentBytes+=length;offset+=length;
      if(currentBytes===CHUNK_BYTES)await closePart();
    }
  }
  await closePart();
  const tag=`v${manifest.version}-preview.1`;
  manifest.status='developer-preview';manifest.signing='local-development';manifest.notarized=false;manifest.appleDeveloperId=false;manifest.sourceCommit=sourceCommit;manifest.publishedAt=new Date().toISOString();
  manifest.assets[architecture]={filename,bytes:info.size,sha256:hash.digest('hex'),url:`/get/mac/${architecture}`,host:'worker-preview',releaseUrl:`https://github.com/dumpydon/cue/releases/download/${tag}/${filename}`,parts};
  await writeFile(path.join(site,'release.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({architecture,filename,bytes:info.size,sha256:manifest.assets[architecture].sha256,parts:parts.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==5)throw Error('Usage: node site/scripts/stage-downloads.mjs <ZIP> <arm64|x64> <source-commit>');
  await stageArtifact(path.resolve(process.argv[2]),process.argv[3],process.argv[4]);
}
