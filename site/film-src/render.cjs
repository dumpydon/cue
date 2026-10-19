/* Run through Electron, normally invoked by export.mjs. */
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.setPath('userData',path.join(__dirname,'.render-cache'));
const ffmpeg=process.env.FFMPEG_BIN||'/opt/homebrew/bin/ffmpeg';
const args=process.argv.slice(2);
const draft=args.includes('--draft');
const framesOnly=args.includes('--frames-only');
const media=path.resolve(__dirname,'../public/media');
const previews=path.join(__dirname,'previews');
async function savePoster(buffer){
  fs.writeFileSync(path.join(previews,'poster.png'),buffer);
  const poster=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-i','pipe:0','-vf','scale=1600:900','-q:v','2','-frames:v','1',path.join(media,'cue-launch-poster.jpg')],{stdio:['pipe','ignore','inherit']});
  poster.stdin.end(buffer);
  const [code]=await once(poster,'exit');if(code!==0)throw new Error(`Poster export exited ${code}`);
}
app.whenReady().then(async()=>{
  fs.mkdirSync(media,{recursive:true});fs.mkdirSync(previews,{recursive:true});
  const win=new BrowserWindow({width:1920,height:1080,show:false,webPreferences:{backgroundThrottling:false,contextIsolation:true}});
  await win.loadFile(path.join(__dirname,'stage.html'));
  await win.webContents.executeJavaScript('window.ready');
  const snap=async t=>{
    return Buffer.from(await win.webContents.executeJavaScript(`renderFrame(${t}); document.getElementById('film').toDataURL('image/png').slice(22)`),'base64');
  };
  if(framesOnly){
    for(const t of [2.7,6.5,11.7,16.7,21.1,24.8]){fs.writeFileSync(path.join(previews,`frame-${t.toFixed(1)}.png`),await snap(t));console.log(`Preview ${t}s`)}
    await savePoster(await snap(6.5));
    app.quit();return;
  }
  const output=path.join(media,draft?'cue-launch-draft.mp4':'cue-launch.mp4');
  const enc=['-hide_banner','-loglevel','warning','-y','-framerate','30','-f','image2pipe','-vcodec','png','-i','pipe:0','-i',path.join(__dirname,'soundtrack.wav'),'-map','0:v','-map','1:a','-vf',draft?'scale=1280:720':'scale=1920:1080','-c:v','libx264','-preset','medium','-crf',draft?'22':'20','-pix_fmt','yuv420p','-profile:v','high','-level','4.1','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart','-t','27',output];
  const ff=spawn(ffmpeg,enc,{stdio:['pipe','ignore','inherit']});
  let failure;ff.on('error',e=>failure=e);ff.stdin.on('error',()=>{});
  const done=new Promise((res,rej)=>{ff.on('exit',code=>code===0?res():rej(new Error(`FFmpeg exited ${code}`)))});
  for(let i=0;i<810;i++){
    if(failure)throw failure;
    if(!ff.stdin.write(await snap(i/30)))await once(ff.stdin,'drain');
    if(i%90===0)console.log(`Rendered ${i}/810 frames`);
  }
  ff.stdin.end();await done;
  console.log(`Exported ${output} (${fs.statSync(output).size} bytes)`);
  await savePoster(await snap(6.5));
  win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1)});
