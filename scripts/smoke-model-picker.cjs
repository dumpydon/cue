// Real renderer / IPC / persistence checks with an isolated, keyless profile.
// Catalog data is synthetic; no desktop, audio, credentials or API calls.
const { app, BrowserWindow, screen, systemPreferences, desktopCapturer, ipcMain } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const geometry = require('../src/window-geometry');
const modelHelpers = require('../src/model-preferences');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-model-picker-smoke-'));
app.setPath('userData', profile); process.env.LOCALAPPDATA = profile;
fs.writeFileSync(path.join(profile,'cue-data.json'), JSON.stringify({onboarded:true,models:{openai:{fast:'gpt-6-luna',smart:'gpt-6.1-sol'}}}), {mode:0o600});
systemPreferences.getMediaAccessStatus = () => 'granted';
systemPreferences.askForMediaAccess = () => {throw new Error('No permission request allowed');};
desktopCapturer.getSources = () => {throw new Error('No capture allowed');};
const appLink = require('../vendor/app-link'), NativeAppLink = appLink.AppLinkServer;
appLink.AppLinkServer = class extends NativeAppLink {constructor(options){super({...options,appId:options.appId+'.model-picker-'+process.pid});}};
let catalogRequests = 0;
let ignoringMouse = true;
ipcMain.on('mouse:ignore', (_event, value) => { ignoringMouse = !!value; });
require('../src/model-catalog').createModelCatalog = () => ({ get: async () => {
  catalogRequests++;
  return {live:true,models:[...modelHelpers.OPENAI_DEFAULTS,{id:'gpt-6.2-sol',label:'GPT-6.2 Sol'}],message:''};
} });
require('../src/llm').createLLM = () => {throw new Error('No inference allowed');};
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label) {for(let i=0;i<120;i++){if(await predicate())return;await pause(20);}throw new Error('Timed out: '+label);}
const timeout=setTimeout(()=>fail(new Error('Model picker smoke timed out')),30000);
function fail(error){clearTimeout(timeout);console.error(error);app.exit(1);}
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
app.on('browser-window-created',(_event,win)=>{
  win.hide(); win.showInactive=()=>{}; win.show=()=>{}; win.focus=()=>{};
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load',async()=>{
    if(!win.webContents.getURL().endsWith('/renderer/index.html'))return;
    try {
      const wc=win.webContents, js=async code=>{try{return await wc.executeJavaScript(code,true);}catch(error){throw new Error(code.slice(0,180)+'\n'+error.message);}};
      await until(()=>js('!!document.querySelector("#messages .ai-text")'),'renderer initialization');
      assert.equal(await js('window.cue.settingsGet().then(s=>Object.values(s.apiKeys).every(key=>!key))'),true);
      const area=screen.getPrimaryDisplay().workArea;
      win.setBounds(geometry.restoreBounds({windowWidth:700,windowHeight:700},area));await pause(100);
      const click=selector=>js('document.querySelector('+JSON.stringify(selector)+').click()');
      async function openSettings(){await click('#tb-settings-btn');await until(()=>js('!document.querySelector("#settings-scrim").classList.contains("hidden")'),'settings');}
      async function choose(tier,id){
        await click('#model-'+tier+'-toggle');
        await until(()=>js('!!document.querySelector('+JSON.stringify('#model-menu .model-option[data-model="'+id+'"]')+')'),'option '+id);
        await click('#model-menu .model-option[data-model="'+id+'"]');
        await until(()=>js('document.querySelector("#model-'+tier+'").value==='+JSON.stringify(id)),'selected '+id);
      }
      async function screenshot(name){
        if(!process.env.CUE_WINDOW_QA_DIR)return;
        fs.mkdirSync(process.env.CUE_WINDOW_QA_DIR,{recursive:true});
        const b=win.getBounds(), image=await wc.capturePage({x:300,y:0,width:b.width-600,height:b.height});
        fs.writeFileSync(path.join(process.env.CUE_WINDOW_QA_DIR,name+'.png'),image.toPNG());
      }
      await openSettings();
      await until(()=>catalogRequests>0,'catalog fetch');
      await click('#model-fast-toggle');await pause(80);
      const visibleIds=await js('Array.from(document.querySelectorAll("#model-menu .model-option")).map(el=>el.dataset.model)');
      assert.ok(modelHelpers.OPENAI_DEFAULTS.every(model=>visibleIds.includes(model.id)));
      assert.ok(visibleIds.includes('gpt-6.2-sol'),'new API-discovered model appears without a typed name');
      await js('(()=>{const el=document.querySelector("#model-menu .model-option");const r=el.getBoundingClientRect();document.dispatchEvent(new MouseEvent("mousemove",{clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true}));})()');
      await until(()=>!ignoringMouse,'dropdown portal accepts mouse input');
      await screenshot('fast-dropdown');
      await click('#model-menu .model-option[data-model="gpt-6-sol"]');
      assert.equal(await js('document.querySelector("#model-smart").value'),'gpt-6.1-sol');
      await choose('smart','gpt-5.6-luna');
      assert.equal(await js('document.querySelector("#model-fast").value'),'gpt-6-sol');
      await click('#s-close');await until(()=>js('document.querySelector("#settings-scrim").classList.contains("hidden")'),'saved settings');
      let saved=JSON.parse(fs.readFileSync(path.join(profile,'cue-data.json'),'utf8'));
      assert.equal(saved.models.openai.fast,'gpt-6-sol');assert.equal(saved.models.openai.smart,'gpt-5.6-luna');

      await openSettings();await click('#model-smart-toggle');await pause(80);
      await js('document.querySelector("#model-menu .model-option[data-model=\\"gpt-5.6-luna\\"]").parentElement.querySelector(".model-delete").click()');
      await until(()=>js('!document.querySelector("#model-menu .model-option[data-model=\\"gpt-5.6-luna\\"]")'),'deleted model disappears');
      assert.equal(await js('document.querySelector("#model-smart").value'),'gpt-5.6-luna');
      await click('#s-close');await pause(100);
      const loaded=new Promise(resolve=>wc.once('did-finish-load',resolve));wc.reload();await loaded;
      await until(()=>js('!!document.querySelector("#messages .ai-text")'),'renderer reload');
      await openSettings();await click('#model-fast-toggle');await pause(80);
      assert.equal(await js('!!document.querySelector("#model-menu .model-option[data-model=\\"gpt-5.6-luna\\"]")'),false,'deleted preset stays hidden across reload');
      await js('document.querySelector("#model-fast").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
      assert.equal(await js('document.querySelector("#settings-scrim").classList.contains("hidden")'),false,'Escape closes only the dropdown');

      await js('document.querySelector("#model-fast").value="Luna";document.querySelector("#model-fast").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#model-fast").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
      await until(()=>js('document.querySelector("#model-fast").value==="gpt-6-luna"'),'search term selects a known model');
      await js('document.querySelector("#model-fast").value="GPT-6 Soul";document.querySelector("#model-fast").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#model-fast").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
      await until(()=>js('document.querySelector("#model-fast").value==="gpt-6-sol"'),'friendly model normalized');
      await js('document.querySelector("#model-smart").value="gpt-6.9-sol";document.querySelector("#model-smart").dispatchEvent(new Event("input",{bubbles:true}));');
      await click('#model-menu .model-custom');
      await until(()=>js('window.cue.modelChoices("openai").then(s=>s.entries.some(m=>m.id==="gpt-6.9-sol"))'),'new typed model saved');
      await click('#provider-seg [data-provider="custom"]');
      await js('document.querySelector("#model-fast").value="tenant/my-model";document.querySelector("#model-fast").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#model-fast").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));');
      await until(()=>js('window.cue.modelChoices("custom").then(s=>s.entries.some(m=>m.id==="tenant/my-model"))'),'custom provider history');
      await click('#provider-seg [data-provider="openai"]');
      assert.equal(await js('document.querySelector("#model-smart").value'),'gpt-6.9-sol','provider switch retains typed model');
      await choose('smart','gpt-6.2-sol');
      await click('#s-close');await pause(100);
      saved=JSON.parse(fs.readFileSync(path.join(profile,'cue-data.json'),'utf8'));
      assert.equal(saved.models.openai.smart,'gpt-6.2-sol');
      assert.equal(saved.modelPreferences.providers.openai.entries.some(m=>m.id==='tenant/my-model'),false);
      assert.equal(saved.modelPreferences.providers.custom.entries.some(m=>m.id==='tenant/my-model'),true);

      win.setBounds(geometry.restoreBounds({windowWidth:520,windowHeight:360},area));await pause(80);
      await openSettings();
      await js('document.querySelector("#model-smart").scrollIntoView({block:"nearest"})');
      await click('#model-smart-toggle');await pause(80);
      const rect=await js('(()=>{const r=document.querySelector("#model-menu").getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};})()');
      assert.ok(rect.top>=0&&rect.bottom<=rect.height,JSON.stringify(rect));
      await screenshot('small-window-dropdown');
      const beforeZoom=win.getBounds();
      wc.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'-',meta:true});await pause(100);
      const zoomRect=await js('(()=>{const r=document.querySelector("#model-menu").getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};})()');
      assert.ok(zoomRect.top>=0&&zoomRect.bottom<=zoomRect.height,JSON.stringify(zoomRect));
      assert.deepEqual(win.getBounds(),beforeZoom);
      wc.emit('before-input-event',{preventDefault(){}},{type:'keyDown',key:'0',meta:true});await pause(100);
      await js('document.querySelector("#model-smart").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));document.querySelector("#s-close").click();');
      clearTimeout(timeout);
      console.log('PASS: Fast/Smart dropdowns, all seven defaults, dynamic future models, typing, deletion, reload, provider isolation and popup placement.');
      app.quit();
    }catch(error){fail(error);}
  });
});
require('../main.js');
