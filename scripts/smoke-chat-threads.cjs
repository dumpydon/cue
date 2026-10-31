// Run with node. Two fresh Electron processes share one synthetic profile to
// verify actual restart recovery. No user data, real capture or model calls.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-chat-smoke-'));
  let result = 0;
  try {
    for (const phase of ['write', 'read']) {
      const run = spawnSync(require('electron'), [__filename], { env: { ...process.env, CUE_CHAT_SMOKE_PROFILE: profile, CUE_CHAT_SMOKE_PHASE: phase }, stdio: 'inherit', timeout: 120000 });
      if (run.status !== 0) { result = run.status || 1; break; }
    }
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  process.exit(result);
}
const { app, desktopCapturer, globalShortcut, ipcMain, screen, session, systemPreferences } = require('electron');
const profile = process.env.CUE_CHAT_SMOKE_PROFILE, phase = process.env.CUE_CHAT_SMOKE_PHASE;
assert.ok(profile && phase, 'Start this suite through node.');
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
if (phase === 'write') {
  fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({ onboarded:true, provider:'openai', apiKeys:{openai:'synthetic-only'}, screenShareProtection:false }), {mode:0o600});
  fs.writeFileSync(path.join(profile, 'meetings.json'), JSON.stringify([{ id:'recording-one',title:'Synthetic graph discussion',startedAt:1000,endedAt:2000,summary:'A discussion of graph traversal.', transcript:[{channel:'them',text:'SECRET_RECORDING_CONTEXT',ts:1500}],actionItems:[],keyPoints:[],decisions:[],followUp:[] }]));
}
systemPreferences.getMediaAccessStatus = () => 'denied';
systemPreferences.askForMediaAccess = () => { throw Error('Physical permission requests forbidden'); };
desktopCapturer.getSources = () => { throw Error('Physical capture forbidden'); };
globalShortcut.register = () => false; globalShortcut.unregister = () => {}; globalShortcut.unregisterAll = () => {};
require('../src/model-catalog').createModelCatalog = () => ({ get:async()=>({models:[],live:false}) });
const requests = []; let hold = false, release;
require('../src/llm').createLLM = () => ({ ready:true,provider:'openai',model:'synthetic',async stream(request) {
  requests.push(request);
  if (hold) { request.onToken('Partial response preserved across restart.'); await new Promise(resolve=>{release=resolve;}); return 'Completed held response.'; }
  const text = 'Use **recursion with memoization** when the subproblems overlap.\n\n```python\ndef solve(n):\n    if n <= 1:\n        return n\n    return solve(n - 1) + solve(n - 2)\n```\n\nTime: O(n). Space: O(n).';
  request.onToken(text); return text;
} });
const appLink = require('../vendor/app-link'), BaseServer = appLink.AppLinkServer;
appLink.AppLinkServer = class extends BaseServer {constructor(options){super({...options,appId:options.appId+'.chat-smoke-'+process.pid});}};
const pause = ms => new Promise(r=>setTimeout(r,ms));
async function until(check,label) {for(let i=0;i<300;i++){if(await check())return;await pause(20);}throw Error('Timed out: '+label);}
const deadline=setTimeout(()=>fail(Error('Chat integration suite timed out')),100000);
function fail(error){clearTimeout(deadline);console.error(error);app.exit(1);}
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
app.on('browser-window-created',(_,win)=>{
 win.hide();win.show=()=>{};win.showInactive=()=>{};win.focus=()=>{};win.webContents.setBackgroundThrottling(false);
 win.webContents.once('did-finish-load',async()=>{
  if(!win.webContents.getURL().endsWith('/renderer/index.html'))return;
  const wc=win.webContents, js=source=>wc.executeJavaScript(source,true);
  const state=()=>js('window.cue.chatsState()');
  const mutate=(action,id,payload)=>js(`window.cue.chatMutate(${JSON.stringify(action)},${JSON.stringify(id)},${JSON.stringify(payload)})`);
  async function ask(text,{pending=false}={}) {
   const count=requests.length;
   await js(`document.querySelector('#input').value=${JSON.stringify(text)};document.querySelector('#input').dispatchEvent(new Event('input'));document.querySelector('#send-btn').click()`);
   await until(()=>requests.length===count+1,'provider gets submitted question');
   if(!pending)await until(()=>js('!document.querySelector("#new-answer-thread").disabled'),'answer settles');
   return requests.at(-1);
  }
  async function clickText(text) {
   await js(`(()=>{const b=[...document.querySelectorAll('#sessions button')].find(b=>b.textContent===${JSON.stringify(text)}&&!b.disabled);if(!b)throw Error('Button missing: '+${JSON.stringify(text)});b.click()})()`);
  }
  async function screenshot(name){
   const directory=process.env.CUE_WINDOW_QA_DIR;if(!directory)return;
   await js("document.querySelectorAll('.user-bubble').forEach(b=>b.getAnimations().forEach(a=>a.finish()))");await pause(100);
   fs.mkdirSync(directory,{recursive:true});const bounds=win.getBounds();
   fs.writeFileSync(path.join(directory,name+'.png'),(await wc.capturePage({x:300,y:0,width:bounds.width-600,height:bounds.height})).toPNG());
  }
  try{
   const external=[]; session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,callback)=>{external.push(d.url);callback({cancel:true});});
   await until(()=>js('!!document.querySelector(".chat-empty, .response-group")'),'chat restored');
   await js('window.CueMeetingModeUI.ready');
   const geometry=require('../src/window-geometry');win.setBounds(geometry.restoreBounds({windowWidth:900,windowHeight:800},screen.getPrimaryDisplay().workArea));
   if(phase==='read'){
    const saved=JSON.parse(fs.readFileSync(path.join(profile,'fixture.json'),'utf8'));
    const snapshot=await state();assert.equal(snapshot.chat.id,saved.chatId);assert.equal(snapshot.chat.title,'LeetCode');
    assert.equal(snapshot.chat.total,55);assert.equal(snapshot.chat.exchanges.at(-1).status,'interrupted');
    assert.match(snapshot.chat.exchanges.at(-1).assistant,/Partial response/);
    assert.match(await js('document.querySelector("#messages").textContent'),/Answer interrupted/);
    assert.equal(await js('document.querySelectorAll(".response-group").length'),30,'restore renders only the newest page');
    await js('document.querySelector(".history-load-earlier").click()');
    await until(()=>js('document.querySelectorAll(".response-group").length===55'),'earlier answers load');
    assert.match(await js('document.querySelector("#messages").textContent'),/coin change/);
    assert.equal(snapshot.chat.contextEnabled,false,'context setting survives a second process');
    assert.equal(await js('document.querySelector("#chat-context-toggle").textContent'),'Context off');
    await js('document.querySelector("#chat-context-toggle").click()');
    await until(async()=>(await state()).chat.contextEnabled===true,'re-enable recall after restart');
    const request=await ask('Solve another DP problem.');
    assert.match(request.system,/bottom-up/);assert.doesNotMatch(JSON.stringify(request.turns),/Partial response|SECRET_RECORDING_CONTEXT|RAG_ONLY/);
    assert.equal((await state()).chat.total,56);
    await screenshot('restored-thread');
    assert.deepEqual(external,[]);clearTimeout(deadline);console.log('PASS: second-process restoration, pagination, interrupted-answer recovery and persistent isolated memory.');app.quit();return;
   }
   assert.equal((await state()).chat,null);
   await ask('Explain coin change using DP.');
   let snapshot=await state();const leetcode=snapshot.chat.id;
   assert.match(snapshot.chat.title,/coin change/);
   await js('document.querySelector("#chat-title").click()');
   await until(()=>js('!!document.querySelector("#history-continue")'),'chat detail');
   await clickText('Rename');await until(()=>js('!!document.querySelector("#history-name")'),'rename editor');
   await js('document.querySelector("#history-name").value="LeetCode";document.querySelector("#history-rename-save").click()');
   await until(async()=>(await state()).chat.title==='LeetCode','rename persists');
   await until(()=>js('!!document.querySelector("#history-continue")'),'renamed detail');
   await screenshot('chat-detail');
   await js('document.querySelector("#sessions-close").click()');
   await ask('I prefer DP questions in recursive form with memoization.');
   assert.equal((await state()).chat.memories.length,1);
   const firstTokens=[];
   for(let i=0;i<50;i++){
    const request=await ask('Explain graph traversal problem '+i+'.');
    const current=await state();const budget=current.chat.exchanges.at(-1).budget;
    assert.ok(budget.estimatedInputMultiplier<=1.9);assert.ok(budget.addedTextTokens<=1800);firstTokens.push(budget.totalTextTokens);
    assert.doesNotMatch(JSON.stringify(request.turns),/SECRET_RECORDING_CONTEXT/);
   }
   await ask('Actually, I prefer bottom-up tabulation for DP questions.');
   assert.equal((await state()).chat.memories.length,1);assert.match((await state()).chat.memories[0].text,/bottom-up/);
   assert.equal((await state()).chat.total,53);
   await js('document.querySelector("#chat-memory").click()');await until(()=>js('!!document.querySelector("#chat-memory-save")'),'memory editor');
   assert.match(await js('document.querySelector(".memory-text").value'),/bottom-up/);
   await js('document.querySelector("#chat-instructions").value="Include a small worked example and time complexity.";document.querySelector("#chat-memory-save").click()');
   await until(async()=>(await state()).chat.instructions.includes('worked example'),'instructions saved');
   await until(()=>js('!!document.querySelector("#history-continue")'),'memory saved detail');await clickText('Memory');
   await until(()=>js('!!document.querySelector("#chat-memory-save")'),'memory editor reopened');await screenshot('chat-memory');
   await js('document.querySelector("#sessions-close").click()');
   await mutate('create');const rag=(await state()).chat.id;await mutate('rename',rag,'RAG');
   const ragRequest=await ask('RAG_ONLY: Explain retrieval-augmented generation.');
   assert.doesNotMatch(ragRequest.system,/bottom-up|worked example/);assert.equal(ragRequest.turns.length,1);
   await js('document.querySelector("#sessions-btn").click()');await until(()=>js('document.querySelectorAll(".session-card").length===2'),'two independent chats');await screenshot('chat-history');
   await js('document.querySelector(".history-item-options").click()');
   assert.equal(await js('document.querySelector(".history-item-menu").hidden'),false,'row options expose rename and delete');
   await screenshot('history-row-actions');
   await js('document.querySelector(".history-item-options").click()');
   win.setBounds(geometry.restoreBounds({windowWidth:520,windowHeight:360},screen.getPrimaryDisplay().workArea));await pause(100);
   const compactHistory=await js('(()=>{const d=document.querySelector("#sessions"),c=document.querySelector("#sessions-content");return {dialog:d.getBoundingClientRect().bottom,content:c.getBoundingClientRect().bottom,height:c.clientHeight,body:document.body.scrollWidth,width:innerWidth}})()');
   assert.ok(compactHistory.height>24 && compactHistory.content<=compactHistory.dialog);
   assert.equal(compactHistory.body,compactHistory.width);
   await screenshot('history-compact');
   win.setBounds(geometry.restoreBounds({windowWidth:900,windowHeight:800},screen.getPrimaryDisplay().workArea));await pause(100);

   await js('document.querySelector("[data-tab=recordings]").click()');await until(()=>js('!!document.querySelector(".session-card")'),'recordings list');
   await js('document.querySelector(".session-card").click()');await until(()=>js('!!document.querySelector(".session-turn")'),'recording detail');
   await clickText('Rename');await until(()=>js('!!document.querySelector("#history-name")'),'recording rename');
   await js('document.querySelector("#history-name").value="Graph call";document.querySelector("#history-rename-save").click()');
   await until(()=>js('document.querySelector("#sessions-title").textContent==="Graph call"'),'recording renamed');
   await clickText('Delete');await until(()=>js('document.querySelector("#sessions-title").textContent==="History"'),'recording removed');
   assert.equal((await js('window.cue.sessionsList()')).length,0);
   await js('document.querySelector("[data-tab=trash]").click()');await until(()=>js('!!document.querySelector(".history-trash-row")'),'trash shows recording');
   await clickText('Restore');await until(async()=>(await js('window.cue.sessionsList()')).length===1,'recording restored');
   await js('document.querySelector("#sessions-close").click()');
   await mutate('trash',rag);assert.equal((await state()).chat,null);assert.equal((await js('window.cue.chatsList({trash:true})')).length,1);
   await mutate('restore',rag);await mutate('activate',leetcode);
   assert.equal((await state()).chat.title,'LeetCode');assert.match((await state()).chat.memories[0].text,/bottom-up/);
   await js('document.querySelector("#chat-context-toggle").click()');
   await until(async()=>(await state()).chat.contextEnabled===false,'turn all chat recall off');
   const offRequest=await ask('Fresh standalone question with recall off.');
   assert.equal(offRequest.turns.length,1);assert.doesNotMatch(offRequest.system,/bottom-up|worked example|Recent topics in this chat/);
   assert.equal((await state()).chat.exchanges.at(-1).budget.addedTextTokens,0);
   // Rapid thread switches and late results cannot attach to a different chat.
   hold=true;await ask('Pending response for restart test.',{pending:true});await until(()=>!!release,'held response');
   assert.equal((await js('window.cue.resetAnswerThread()')).ok,false);
   assert.match(await js(`window.cue.chatMutate('activate',${JSON.stringify(rag)}).then(()=>'',e=>e.message)`),/Wait/);
   assert.match(await js(`window.cue.chatMutate('trash',${JSON.stringify(leetcode)}).then(()=>'',e=>e.message)`),/Wait/);
   // Allow debounced draft checkpoint to land, then quit without resolving it.
   await pause(800);
   fs.writeFileSync(path.join(profile,'fixture.json'),JSON.stringify({chatId:leetcode}));
   assert.deepEqual(external,[]);
   console.log('PASS: real UI rename, memory editor, 50-problem budget, chat isolation, recording trash/restore, busy guards and partial-answer checkpoint.');
   clearTimeout(deadline);app.quit();
  }catch(error){fail(error);}
 });
});
require('../main');
