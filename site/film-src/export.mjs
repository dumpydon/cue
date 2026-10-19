/* Reproducible original audiovisual asset export, no npm dependencies. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir=path.dirname(fileURLToPath(import.meta.url));
const sr=48000,seconds=27,n=seconds*sr;
const pcm=Buffer.alloc(n*4);
const changes=[0,4.6,9.1,14.6,19.2,23.1];
const chords=[[110,164.8138,220,261.6256],[130.8128,196,261.6256,329.6276],[98,146.8324,196,246.9417],[110,164.8138,220,293.6648],[130.8128,196,261.6256,329.6276],[110,164.8138,220,329.6276]];
for(let i=0;i<n;i++){
  const t=i/sr;
  let l=0,r=0;
  changes.forEach((st,j)=>{
    const end=changes[j+1]??27;
    const env=Math.min(1,Math.max(0,(t-st)/1.2))*Math.min(1,Math.max(0,(end+1.2-t)/1.5));
    if(!env)return;
    chords[j].forEach((f,k)=>{
      const amp=.016*env*(1-.12*k)*(1+.14*Math.sin(t*.7+k));
      l+=amp*(Math.sin(2*Math.PI*f*t)+.17*Math.sin(2*Math.PI*f*2*t));
      r+=amp*(Math.sin(2*Math.PI*f*1.0004*t+.1)+.17*Math.sin(2*Math.PI*f*2.0003*t));
    });
    const dt=t-st;
    if(dt>=0&&dt<1.2){const a=.012*Math.exp(-dt*4);l+=a*Math.sin(2*Math.PI*(880*dt-110*dt*dt));r+=a*Math.sin(2*Math.PI*(882*dt-110*dt*dt));}
  });
  const master=Math.min(1,t/1.7)*Math.min(1,(27-t)/1.7);
  pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,l*master))*32767),i*4);
  pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,r*master))*32767),i*4+2);
}
const header=Buffer.alloc(44);header.write('RIFF',0);header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(sr,24);header.writeUInt32LE(sr*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
fs.writeFileSync(path.join(dir,'soundtrack.wav'),Buffer.concat([header,pcm]));
const electron=process.env.ELECTRON_BIN||path.resolve(dir,'../../node_modules/.bin/electron');
const p=spawn(electron,[path.join(dir,'render.cjs'),...process.argv.slice(2)],{stdio:'inherit',cwd:dir,env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
p.on('exit',code=>{
  if(code===0&&!process.argv.includes('--draft')&&!process.argv.includes('--frames-only')){
    const movie=fs.readFileSync(path.resolve(dir,'../public/media/cue-launch.mp4'));
    fs.writeFileSync(path.resolve(dir,'../film.json'),JSON.stringify({path:'/media/cue-launch.mp4',bytes:movie.length,sha256:createHash('sha256').update(movie).digest('hex')},null,2)+'\n');
  }
  process.exit(code??1);
});p.on('error',e=>{console.error(e);process.exit(1)});
