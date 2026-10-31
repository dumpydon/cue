// Real macOS workspace membership and toolbar behavior in a keyless profile.
const {app,systemPreferences,desktopCapturer,globalShortcut,screen}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cue-workspaces-'));
app.setPath('userData',profile);process.env.LOCALAPPDATA=profile;
fs.writeFileSync(path.join(profile,'cue-data.json'),JSON.stringify({onboarded:true,screenShareProtection:false}),{mode:0o600});
systemPreferences.getMediaAccessStatus=()=> 'denied';systemPreferences.askForMediaAccess=()=>{throw Error('No permission request');};desktopCapturer.getSources=()=>{throw Error('No capture');};
globalShortcut.register=()=>false;globalShortcut.unregister=()=>{};globalShortcut.unregisterAll=()=>{};
const appLink=require('../vendor/app-link'),Base=appLink.AppLinkServer;
appLink.AppLinkServer=class extends Base{constructor(options){super({...options,appId:options.appId+'.workspace-test-'+process.pid});}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<200;i++){if(await check())return;await pause(20);}throw Error('Timeout: '+label);}
const deadline=setTimeout(()=>fail(Error('Workspace test timed out')),30000);
function fail(error){clearTimeout(deadline);console.error(error);app.exit(1);}
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
app.on('browser-window-created',(_,win)=>{
 win.hide();win.show=()=>{};win.showInactive=()=>{};win.focus=()=>{};win.webContents.setBackgroundThrottling(false);
 win.webContents.once('did-finish-load',async()=>{
  if(!win.webContents.getURL().endsWith('/renderer/index.html'))return;
  const wc=win.webContents,js=source=>wc.executeJavaScript(source,true);
  try{
   await until(()=>js('!!document.querySelector("#workspace-btn").dataset.mode'),'workspace toggle ready');
   assert.equal(win.isVisibleOnAllWorkspaces(),false,'normal desktop-only membership is the default');
   const initial=win.getBounds(),protection=await js('window.cue.protectionGet()');
   assert.equal(await js('document.querySelector("#workspace-btn").dataset.mode'),'this-desktop');
   assert.equal(await js('document.querySelector("#workspace-btn").getAttribute("aria-pressed")'),'true');
   await js('document.querySelector("#workspace-btn").click();document.querySelector("#workspace-btn").click()');
   await until(()=>js('!document.querySelector("#workspace-btn").disabled'),'toggle settles');
   assert.equal(win.isVisibleOnAllWorkspaces(),true,'real native window follows all workspaces only when explicitly enabled');
   assert.equal(await js('document.querySelector("#workspace-btn").dataset.mode'),'all-desktops');
   assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'cue-data.json'),'utf8')).followAllWorkspaces,true);
   await js('window.cue.settingsSet({followAllWorkspaces:false})');
   assert.equal(win.isVisibleOnAllWorkspaces(),true,'stale whole-settings saves cannot override the dedicated toggle');
   assert.equal((await js('window.cue.workspaceGet()')).followAll,true);
   const loaded=new Promise(resolve=>wc.once('did-finish-load',resolve));wc.reload();await loaded;
   await until(()=>js('document.querySelector("#workspace-btn")?.dataset.mode==="all-desktops"&&!document.querySelector("#workspace-btn").disabled'),'saved following preference restores');
   await js('document.querySelector("#workspace-btn").click()');
   await until(()=>js('document.querySelector("#workspace-btn").dataset.mode==="this-desktop"&&!document.querySelector("#workspace-btn").disabled'),'pin to current desktop');
   assert.equal(win.isVisibleOnAllWorkspaces(),false);assert.deepEqual(win.getBounds(),initial);
   assert.deepEqual(await js('window.cue.protectionGet()'),protection,'workspace toggling leaves screen-share protection unchanged');
   assert.equal((await js('window.cue.captureState()')).active,false);
   for(const size of [{windowWidth:520,windowHeight:360},{windowWidth:850,windowHeight:700}]){
    win.setBounds(require('../src/window-geometry').restoreBounds(size,screen.getPrimaryDisplay().workArea));await pause(100);
    assert.equal(await js('(()=>{const b=document.querySelector("#workspace-btn").getBoundingClientRect(),t=document.querySelector("#toolbar").getBoundingClientRect();return b.width>0&&b.left>=t.left&&b.right<=t.right&&b.bottom<=t.bottom&&document.body.scrollWidth===innerWidth;})()'),true,'button fits compact and regular toolbar');
   }
   const dir=process.env.CUE_WINDOW_QA_DIR;
   if(dir){fs.mkdirSync(dir,{recursive:true});const b=win.getBounds();fs.writeFileSync(path.join(dir,'workspace-toggle.png'),(await wc.capturePage({x:300,y:0,width:b.width-600,height:b.height})).toPNG());}
   assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'cue-data.json'),'utf8')).followAllWorkspaces,false);
   clearTimeout(deadline);console.log('PASS: actual native current/all workspace membership, saved preference, rapid-click guard, stale-settings isolation, reload, compact toolbar, capture/privacy independence, and no geometry change.');app.quit();
  }catch(error){fail(error);}
 });
});
require('../main');
