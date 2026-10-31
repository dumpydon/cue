// Real main/preload/renderer stress and recovery, with a disposable profile,
// synthetic audio/screen and model. Never records hardware or calls a provider.
const {app,desktopCapturer,globalShortcut,screen,session,systemPreferences}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cue-answer-reliability-'));
app.setPath('userData',profile);process.env.LOCALAPPDATA=profile;
fs.writeFileSync(path.join(profile,'cue-data.json'),JSON.stringify({onboarded:true,provider:'openai',sttProvider:'openai',apiKeys:{openai:'synthetic-only'},screenShareProtection:false,meetingAudio:true}),{mode:0o600});
systemPreferences.getMediaAccessStatus=()=> 'granted';systemPreferences.askForMediaAccess=()=>{throw Error('Physical permission request forbidden');};
desktopCapturer.getSources=()=>{throw Error('Physical screen capture forbidden');};
globalShortcut.register=()=>false;globalShortcut.unregister=()=>{};globalShortcut.unregisterAll=()=>{};
require('../src/model-catalog').createModelCatalog=()=>({get:async()=>({models:[],live:false})});
require('../src/stt-streaming').createStreamingSTT=()=>({type:'batch',instance:null});
require('../src/stt').createSTT=()=>({available:true,transcribe:async()=>({text:''})});
const realRun=require('../src/answer-run').createAnswerRun;
require('../src/answer-run').createAnswerRun=options=>{
 const run=realRun({totalMs:1800,firstActivityMs:180,idleMs:130,...options});
 const stage=run.stage;run.stage=(work,ms,message)=>stage(work,Math.min(ms,220),message);return run;
};
let scenario='normal',captureHung=false;
require('../src/screen').captureScreenshot=async()=>captureHung?new Promise(()=>{}):'data:image/jpeg;base64,c3ludGhldGlj';
const requests=[],held=[];
require('../src/llm').createLLM=()=>({ready:true,provider:'openai',model:'synthetic',async stream(request){
 if(request.system.startsWith('You are cue, writing private meeting notes'))return 'Synthetic notes.';
 requests.push(request);
 if(scenario==='hold'){request.onToken('Partial code answer preserved.\n\n```python\ndef solve():\n    return 42\n```');const pulse=setInterval(()=>request.onProgress?.(),40);request.signal.addEventListener('abort',()=>clearInterval(pulse),{once:true});return new Promise(resolve=>held.push({request,resolve:value=>{clearInterval(pulse);resolve(value);}}));}
 if(scenario==='stall'){request.onToken('Partial stalled answer.');return new Promise(()=>{});}
 if(scenario==='large'){request.onToken('Useful partial before oversized output.');request.onToken('X'.repeat(100001));return 'X'.repeat(100001);}
 if(scenario==='reasoning'){
  await new Promise(resolve=>{const timer=setInterval(()=>request.onProgress?.(),40);setTimeout(()=>{clearInterval(timer);resolve();},420);});
  request.onToken('A slow but healthy answer.');return 'A slow but healthy answer.';
 }
 const answer='A complete answer for the current question.\n\n```python\nvalue = 42\n```';request.onToken(answer);return answer;
}});
const appLink=require('../vendor/app-link'),Base=appLink.AppLinkServer;
appLink.AppLinkServer=class extends Base{constructor(options){super({...options,appId:options.appId+'.answer-stress-'+process.pid});}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<350;i++){if(await check())return;await pause(20);}throw Error('Timed out: '+label);}
const deadline=setTimeout(()=>fail(Error('Answer reliability suite timed out')),60000);
function fail(error){clearTimeout(deadline);console.error(error);app.exit(1);}
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
app.on('browser-window-created',(_,win)=>{
 win.hide();win.show=()=>{};win.showInactive=()=>{};win.focus=()=>{};win.webContents.setBackgroundThrottling(false);
 win.webContents.once('did-finish-load',async()=>{
  if(!win.webContents.getURL().endsWith('/renderer/index.html'))return;
  const wc=win.webContents,js=code=>wc.executeJavaScript(code,true);
  const state=()=>js('window.cue.answerState()');
  const chat=()=>js('window.cue.chatsState()');
  async function post(text,kind='normal'){
   scenario=kind;const count=requests.length;
   await js(`document.querySelector('#input').value=${JSON.stringify(text)};document.querySelector('#input').dispatchEvent(new Event('input'));document.querySelector('#send-btn').click()`);
   await until(()=>requests.length===count+1,'provider receives '+text);
   return requests.at(-1);
  }
  async function settled(){await until(async()=>!(await state()).busy,'request settles');await until(()=>js('!document.querySelector("#new-answer-thread").disabled'),'UI settles');}
  async function screenshot(name){const directory=process.env.CUE_WINDOW_QA_DIR;if(!directory)return;fs.mkdirSync(directory,{recursive:true});await pause(200);const b=win.getBounds();fs.writeFileSync(path.join(directory,name+'.png'),(await wc.capturePage({x:300,y:0,width:b.width-600,height:b.height})).toPNG());}
  try{
   const external=[];session.defaultSession.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(details,callback)=>{external.push(details.url);callback({cancel:true});});
   await until(()=>js('!!window.CueMeetingModeUI && !!document.querySelector(".chat-empty")'),'renderer startup');await js('window.CueMeetingModeUI.ready');
   win.setBounds(require('../src/window-geometry').restoreBounds({windowWidth:850,windowHeight:750},screen.getPrimaryDisplay().workArea));
   const first=await post('Hold this answer.','hold');
   assert.equal(await js('document.querySelector("#send-btn").getAttribute("aria-label")'),'Stop generating answer');
   assert.notEqual(await js('getComputedStyle(document.querySelector("#send-btn")).pointerEvents'),'none');
   await js('document.querySelector("#input").value="My next draft must survive";document.querySelector("#input").dispatchEvent(new Event("input"));document.querySelector("#input").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}))');
   assert.equal(await js('document.querySelector("#input").value'),'My next draft must survive');
   const refused=await js('window.cue.ask({mode:"ask",text:"Overlapping request"})');assert.equal(refused.accepted,false);assert.equal(refused.busy,true);assert.equal(requests.length,1);
   await screenshot('stop-generating');
   await js('document.querySelector("#send-btn").click()');await settled();assert.equal(first.signal.aborted,true);
   assert.equal(await js('document.querySelector("#input").value'),'My next draft must survive');
   const stopped=(await chat()).chat.exchanges.at(-1);assert.equal(stopped.status,'cancelled');assert.match(stopped.assistant,/Partial code answer/);
   assert.match(await js('document.querySelector("#messages").textContent'),/Partial code answer/);
   await post('A new question after stopping.');await settled();
   held[0].request.onToken('LATE_OLD_TOKEN');held[0].resolve('Late old completed answer');await pause(100);
   assert.doesNotMatch(await js('document.querySelector("#messages").textContent'),/LATE_OLD_TOKEN|Late old completed/);
   assert.equal((await chat()).chat.exchanges.at(-1).status,'complete');
   const stalled=await post('Provider stalls.','stall');await settled();assert.equal(stalled.signal.aborted,true);
   assert.equal((await chat()).chat.exchanges.at(-1).status,'failed');assert.match((await chat()).chat.exchanges.at(-1).assistant,/Partial stalled/);
   assert.match(await js('document.querySelector("#messages").textContent'),/Partial stalled answer/);
   await post('Healthy but slow reasoning.','reasoning');await pause(250);assert.equal((await state()).busy,true);await settled();
   assert.equal((await chat()).chat.exchanges.at(-1).status,'complete');
   const tooLarge=await post('Oversized output.','large');await settled();assert.equal(tooLarge.signal.aborted,true);
   assert.match((await chat()).chat.exchanges.at(-1).assistant,/Useful partial/);assert.ok((await chat()).chat.exchanges.at(-1).assistant.length<100000);
   // Mode preparation can fail before a provider receives anything; keep input.
   const beforePreparation=requests.length;
   await js('window.savedFlush=window.CueMeetingModeUI.flush;window.CueMeetingModeUI.flush=()=>new Promise(()=>{});document.querySelector("#input").value="Draft before preparation timeout";document.querySelector("#input").dispatchEvent(new Event("input"));document.querySelector("#send-btn").click()');
   await until(async()=>!(await state()).busy,'bounded mode preparation');await pause(40);
   assert.equal(requests.length,beforePreparation);assert.equal(await js('document.querySelector("#input").value'),'Draft before preparation timeout');
   await js('window.CueMeetingModeUI.flush=window.savedFlush;true');
   captureHung=true;scenario='normal';
   await js('document.querySelector("#input").value="Screen capture stalls";document.querySelector("#input").dispatchEvent(new Event("input"));document.querySelector("#send-btn").click()');
   await until(async()=>(await state()).busy,'capture begins');await settled();captureHung=false;assert.equal(requests.length,beforePreparation);
   await post('Answering still works after capture failure.');await settled();
   // Continuous synthetic mic + system audio, while a response is in progress.
   await js(`(async()=>{
    async function audio(frequency){const context=new AudioContext({sampleRate:16000});await context.resume();const oscillator=context.createOscillator(),gain=context.createGain(),dest=context.createMediaStreamDestination();gain.gain.value=.08;oscillator.frequency.value=frequency;oscillator.connect(gain);gain.connect(dest);oscillator.start();return dest.stream;}
    navigator.mediaDevices.getUserMedia=()=>audio(440);
    navigator.mediaDevices.getDisplayMedia=async()=>{const sound=await audio(660),canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);return new MediaStream([...sound.getAudioTracks(),...canvas.captureStream(1).getVideoTracks()]);};
    await window.CueListening.toggle();
   })()`);
   await until(()=>js('window.cue.captureState().then(s=>s.active)'),'synthetic capture starts');
   await until(()=>js('document.querySelectorAll(".audio-source[data-state=active]").length===2'),'both synthetic sources active');
   const crashing=await post('Preserve this answer across window failure.','hold');
   const loaded=new Promise(resolve=>wc.once('did-finish-load',resolve));wc.forcefullyCrashRenderer();await loaded;
   await until(()=>js('!!window.cue && !!document.querySelector(".response-group")'),'renderer recovered');await settled();
   assert.equal((await js('window.cue.captureState()')).active,false,'recovery never silently resumes microphone/call capture');
   assert.equal(crashing.signal.aborted,true);assert.equal((await chat()).chat.exchanges.at(-1).status,'interrupted');
   assert.match(await js('document.querySelector("#messages").textContent'),/Partial code answer/);
   for(const h of held){h.request.onToken('LATE_AFTER_RECOVERY');h.resolve('Old completed response');}
   await pause(100);assert.doesNotMatch(await js('document.querySelector("#messages").textContent'),/LATE_AFTER_RECOVERY/);
   await post('Fresh answer after recovery.');await settled();assert.equal((await chat()).chat.exchanges.at(-1).status,'complete');
   await screenshot('recovered-answer');assert.deepEqual(external,[]);
   clearTimeout(deadline);console.log('PASS: admission and draft preservation, working Stop control, actual cancellation signal, stalled/oversized providers, slow healthy progress, bounded preparation/screen wait, stale-token rejection, simultaneous synthetic mic/call audio, forced renderer recovery, paused capture, restored partial answers and successful next query.');app.quit();
  }catch(error){fail(error);}
 });
});
require('../main');
