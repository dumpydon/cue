// Real renderer + IPC in a temporary profile. No personal chats, model calls or capture.
const { app, systemPreferences, desktopCapturer, globalShortcut, screen, session } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-sidebar-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({onboarded:true,provider:'openai',apiKeys:{openai:'synthetic-only'},screenShareProtection:false}));
const fixture=require('../src/chat-store').createChatStore({directory:path.join(profile,'chats')});
const ids=[];
for(let i=0;i<65;i++){
 const c=fixture.create();fixture.rename(c.id,['LeetCode practice','RAG research','Mathematics'][i]||'Practice conversation '+i);
 const ref=fixture.begin({user:'Explain problem '+i,mode:'ask',scope:'general'});fixture.finish(ref,{answer:'Use a small, worked example.\n\n```python\ndef solve(n):\n    return n * 2\n```'});ids.push(c.id);
}
fixture.activate(ids[0]);fixture.flush();
fs.writeFileSync(path.join(profile,'meetings.json'),JSON.stringify([{id:'recording-one',title:'Weekly engineering call',startedAt:Date.now()-86400000,endedAt:Date.now()-86000000,summary:'Discussed a **graph traversal** approach.',transcript:Array.from({length:90},(_,i)=>({channel:i%2?'you':'them',text:'Synthetic recording line '+i,ts:i})),actionItems:[],keyPoints:[],decisions:[],followUp:[]}]));
systemPreferences.getMediaAccessStatus=()=> 'denied';systemPreferences.askForMediaAccess=()=>{throw Error('Physical permissions forbidden');};desktopCapturer.getSources=()=>{throw Error('Physical capture forbidden');};
globalShortcut.register=()=>false;globalShortcut.unregister=()=>{};globalShortcut.unregisterAll=()=>{};
require('../src/model-catalog').createModelCatalog=()=>({get:async()=>({models:[],live:false})});
let release,requests=0;
require('../src/llm').createLLM=()=>({ready:true,provider:'openai',model:'synthetic',async stream(request){requests++;request.onToken('Synthetic partial');await new Promise(r=>release=r);return 'Synthetic answer';}});
const link=require('../vendor/app-link'),Base=link.AppLinkServer;
link.AppLinkServer=class extends Base{constructor(options){super({...options,appId:options.appId+'.sidebar-'+process.pid});}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let i=0;i<300;i++){if(await check())return;await pause(20);}throw Error('Timed out: '+label);}
const deadline=setTimeout(()=>fail(Error('Sidebar test deadline')),90000);
function fail(error){clearTimeout(deadline);console.error(error);app.exit(1);}
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
process.on('exit',()=>fs.rmSync(profile,{recursive:true,force:true}));
app.on('browser-window-created',(_,win)=>{
 win.hide();win.show=()=>{};win.showInactive=()=>{};win.focus=()=>{};win.webContents.setBackgroundThrottling(false);
 win.webContents.once('did-finish-load',async()=>{
  if(!win.webContents.getURL().endsWith('/renderer/index.html'))return;
  const wc=win.webContents,js=code=>wc.executeJavaScript(code,true),click=selector=>js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const row=id=>'.library-row[data-id="'+id+'"]';
  const state=()=>js('cue.chatsState()');
  const tab=async name=>{await click('[data-library-tab="'+name+'"]');await until(()=>js('document.querySelector("#sidebar-list").getAttribute("aria-busy")==="false"'),'tab loaded');};
  async function search(text){await js(`document.querySelector('#sidebar-search').value=${JSON.stringify(text)};document.querySelector('#sidebar-search').dispatchEvent(new Event('input'));`);await pause(220);await until(()=>js('document.querySelector("#sidebar-list").getAttribute("aria-busy")==="false"'),'search loaded');}
  async function menu(id,label){await click(row(id)+' .library-options');await js(`(()=>{const button=[...document.querySelector(${JSON.stringify(row(id))}).querySelectorAll('.library-menu button')].find(b=>b.textContent===${JSON.stringify(label)});if(!button)throw Error('Menu action missing');button.click()})()`);}
  async function screenshot(name){if(!process.env.CUE_WINDOW_QA_DIR)return;await pause(180);fs.mkdirSync(process.env.CUE_WINDOW_QA_DIR,{recursive:true});const rect=await js('(()=>{const r=document.querySelector("#panel-wrap").getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()');fs.writeFileSync(path.join(process.env.CUE_WINDOW_QA_DIR,name+'.png'),(await wc.capturePage(rect)).toPNG());}
  try{
   const external=[];session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,cb)=>{external.push(d.url);cb({cancel:true});});
   await until(()=>js('!!window.CueChatLibrary && !!document.querySelector(".response-group")'),'renderer restored');await js('window.CueMeetingModeUI.ready');
   const geometry=require('../src/window-geometry');win.setBounds(geometry.restoreBounds({windowWidth:1040,windowHeight:800},screen.getPrimaryDisplay().workArea));await pause(150);
   assert.equal(await js('document.querySelector("#chat-sidebar").hidden'),true);
   await click('#chat-sidebar-toggle');await until(()=>js('document.querySelectorAll(".library-row").length===40'),'first page');
   assert.equal(await js('document.querySelector("#panel-columns").classList.contains("library-compact")'),false);
   assert.equal(await js('document.querySelector("#chat-sidebar-toggle").getAttribute("aria-expanded")'),'true');
   assert.ok(await js('document.querySelector("#sidebar-list").scrollHeight>document.querySelector("#sidebar-list").clientHeight'));
   await click('#sidebar-load-more');assert.equal(await js('document.querySelectorAll(".library-row").length'),65);
   await click('.library-row:first-of-type .library-options');await until(()=>js('!!document.querySelector(".library-menu:popover-open")'),'first popup');
   await click('.library-row:nth-of-type(3) .library-options');await until(()=>js('document.querySelectorAll(".library-menu:popover-open").length===1'),'one popup at a time');
   await js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true}))');assert.equal(await js('document.querySelectorAll(".library-menu:popover-open").length'),0,'Tab dismisses');
   await js('document.querySelectorAll(".library-options")[64].scrollIntoView({block:"end"})');await pause(100);
   await click('.library-row:last-of-type .library-options');await until(()=>js('!!document.querySelector(".library-menu:popover-open")'),'bottom-row popup');
   assert.ok(await js('(()=>{const m=document.querySelector(".library-menu:popover-open").getBoundingClientRect(),p=document.querySelector("#panel").getBoundingClientRect();return m.top>=p.top&&m.bottom<=p.bottom})()'),'bottom edge popup stays in panel');await screenshot('menu-bottom');
   await js('document.querySelector("#sidebar-list").dispatchEvent(new Event("scroll"))');assert.equal(await js('document.querySelectorAll(".library-menu:popover-open").length'),0,'scroll dismisses detached popup');
   await search('LeetCode');assert.equal(await js('document.querySelectorAll(".library-row").length'),1);
   const beforePopup=await js('(()=>{const row=document.querySelector(".library-row"),list=document.querySelector("#sidebar-list");return {height:row.offsetHeight,scroll:list.scrollHeight}})()');
   await click(row(ids[0])+' .library-options');
   await until(()=>js('!!document.querySelector(".library-menu:popover-open")'),'floating menu opens');
   const popup=await js('(()=>{const menu=document.querySelector(".library-menu:popover-open"),r=menu.getBoundingClientRect(),p=document.querySelector("#panel").getBoundingClientRect(),b=menu.querySelector("button").getBoundingClientRect();return {height:document.querySelector(".library-row").offsetHeight,scroll:document.querySelector("#sidebar-list").scrollHeight,inside:r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom,hit:menu.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)),labels:[...menu.querySelectorAll("button")].map(b=>b.textContent),icons:menu.querySelectorAll(".library-glyph").length,color:getComputedStyle(menu.querySelector(".danger")).color}})()');
   assert.equal(popup.height,beforePopup.height,'popup never expands the chat row');assert.equal(popup.scroll,beforePopup.scroll,'popup never changes list scrolling');assert.ok(popup.inside);assert.ok(popup.hit,'top layer is clickable beyond the sidebar');
   assert.deepEqual(popup.labels,['Rename','Pin','Delete']);assert.equal(popup.icons,3);assert.equal(popup.color,'rgb(255, 92, 100)');
   await screenshot('menu-wide');
   await js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}))');assert.equal(await js('document.activeElement.textContent'),'Pin');
   await js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}))');assert.equal(await js('document.activeElement.textContent'),'Delete');
   await js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');assert.equal(await js('document.querySelectorAll(".library-menu:popover-open").length'),0);assert.equal(await js('document.activeElement.className'),'library-options');
   await click(row(ids[0])+' .library-options');await js('document.querySelector("#sidebar-search").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');assert.equal(await js('document.querySelectorAll(".library-menu:popover-open").length'),0,'outside click dismisses');
   await menu(ids[0],'Pin');await until(()=>js('document.querySelector(".library-group").textContent==="Pinned"'),'pin group');
   assert.ok((await js('cue.chatsList()'))[0].pinnedAt);
   await menu(ids[0],'Rename');await until(()=>js('!!document.querySelector(".library-rename input")'),'rename form');
   await js('document.querySelector(".library-rename input").value="LeetCode · recursive DP";document.querySelector(".library-rename").dispatchEvent(new Event("submit",{cancelable:true}))');
   await until(async()=>(await state()).chat.title==='LeetCode · recursive DP','rename saved');
   await search('');await screenshot('sidebar-wide');
   // A draft belongs to its chat. Switching never sends it or copies it into the next chat.
   await js('document.querySelector("#input").value="Unsent DP follow-up";document.querySelector("#input").dispatchEvent(new Event("input"))');
   await search('RAG');await click(row(ids[1])+' .library-item');await until(async()=>(await state()).chat.id===ids[1],'direct activation');
   assert.equal(await js('document.querySelector("#input").value'),'');assert.equal(await js('document.querySelector("#sessions-scrim").classList.contains("hidden")'),true);
   await search('LeetCode');await click(row(ids[0])+' .library-item');await until(()=>js('document.querySelector("#input").value==="Unsent DP follow-up"'),'draft restored');
   await menu(ids[0],'Delete');await until(async()=>(await state()).chat===null,'active trashed');
   await tab('trash');await until(()=>js('document.querySelectorAll(".library-restore").length===1'),'trash row');
   await click('.library-restore');await until(async()=>(await js('cue.chatsList({trash:true})')).length===0,'chat restored');
   await tab('chats');assert.equal((await js('cue.chatsList()'))[0].id,ids[0]);
   await tab('recordings');await click(row('recording-one')+' .library-item');await until(()=>js('!document.querySelector("#library-detail").hidden'),'recording reader');
   assert.equal(await js('document.querySelectorAll(".library-recording-turn").length'),60);
   assert.equal(await js('getComputedStyle(document.querySelector(".library-recording-body")).color'),'rgb(230, 223, 234)');
   await click('.library-recording-body > .library-action');assert.equal(await js('document.querySelectorAll(".library-recording-turn").length'),90);
   await screenshot('sidebar-recordings');
   await menu('recording-one','Delete');await until(()=>js('document.querySelector("#library-detail").hidden'),'reader closed after trash');
   await tab('trash');await until(()=>js('!!document.querySelector(".library-restore")'),'recording trash');await screenshot('sidebar-trash');await click('.library-restore');
   await until(async()=>(await js('cue.sessionsList()')).length===1,'recording restored');
   await tab('chats');await click('#sidebar-new-chat');await until(async()=>(await state()).chat?.title==='New chat','sidebar new chat');assert.equal(await js('document.querySelector("#input").value'),'');
   assert.equal(await js('document.querySelectorAll("#new-answer-thread").length'),1);await click('#new-answer-thread');await pause(100);assert.equal((await state()).chat.title,'New chat');
   await click('#sessions-btn');await until(()=>js('!document.querySelector("#sessions-scrim").classList.contains("hidden")'),'legacy history opens');await click('#sessions-close');
   await search('LeetCode');await click(row(ids[0])+' .library-item');await until(async()=>(await state()).chat.id===ids[0],'activate before busy test');
   await js('document.querySelector("#input").value="Synthetic question";document.querySelector("#send-btn").click()');await until(()=>!!release,'pending answer');
   assert.equal(await js('document.querySelector("#sidebar-new-chat").disabled'),true);
   assert.equal(await js('document.querySelector(".library-item").disabled'),true);
   assert.match(await js(`cue.chatMutate('pin',${JSON.stringify(ids[0])},false).then(()=>'',e=>e.message)`),/Wait/);
   release();await until(()=>js('!document.querySelector("#sidebar-new-chat").disabled'),'settled controls');assert.equal(requests,1);
   await menu(ids[0],'Unpin');await until(async()=>!(await js('cue.chatsList()')).find(c=>c.id===ids[0]).pinnedAt,'unpin');
   win.setBounds(geometry.restoreBounds({windowWidth:550,windowHeight:650},screen.getPrimaryDisplay().workArea));await until(()=>js('document.querySelector("#panel-columns").classList.contains("library-compact")'),'compact layout');
   assert.equal(await js('document.querySelector("#panel-main").inert'),true);
   await click(row(ids[0])+' .library-options');
   await until(()=>js('!!document.querySelector(".library-menu:popover-open")'),'compact popup');
   assert.ok(await js('(()=>{const m=document.querySelector(".library-menu:popover-open").getBoundingClientRect(),p=document.querySelector("#panel").getBoundingClientRect();return m.left>=p.left&&m.right<=p.right&&m.bottom<=p.bottom})()'));
   await screenshot('menu-compact');
   await js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
   await screenshot('sidebar-compact');
   await js('document.querySelector("#sidebar-search").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');assert.equal(await js('document.querySelector("#chat-sidebar").hidden'),true);assert.equal(await js('document.querySelector("#panel-main").inert'),false);
   await click('#chat-sidebar-toggle');await until(()=>js('!!document.querySelector(".library-item")'),'compact rows');await click(row(ids[0])+' .library-item');await until(()=>js('document.querySelector("#chat-sidebar").hidden'),'compact select dismisses');
   assert.equal(await js('document.documentElement.scrollWidth'),await js('innerWidth'));
   await click('#chat-sidebar-toggle');await js('localStorage.setItem("sidebar-test","yes")');
   // Reload creates fresh renderer state; open preference and all backend pins survive.
   await new Promise(resolve=>{wc.once('did-finish-load',resolve);wc.reload();});await until(()=>js('!!window.CueChatLibrary && !document.querySelector("#chat-sidebar").hidden'),'sidebar preference after reload');
   assert.equal((await js('cue.chatsList()')).find(c=>c.id===ids[0]).title,'LeetCode · recursive DP');
   assert.deepEqual(external,[]);clearTimeout(deadline);console.log('PASS: floating popup geometry, top-layer hit testing, keyboard navigation, dismissal, pagination/search, direct activation, drafts, pin/rename/unpin, chat/recording Trash restore, legacy controls, busy guards, compact drawer, and reload.');app.quit();
  }catch(error){fail(error);}
 });
});
require('../main');
