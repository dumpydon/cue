// Isolated product rendering and interaction tests. No existing browser,
// accounts, physical capture, or user profile is accessed.
const { app, BrowserWindow, session }=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cue-site-qa-'));
app.setPath('userData',profile);app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const target=process.env.CUE_SITE_QA_URL||'http://127.0.0.1:8793/';
const output=path.resolve('.cache/cue-website-qa');fs.mkdirSync(output,{recursive:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){for(let i=0;i<100;i++){if(await predicate())return;await wait(30);}throw Error('Timed out: '+label);}
const deadline=setTimeout(()=>{console.error('Site QA timeout');app.exit(1);},45000);
app.whenReady().then(async()=>{
  const failures=[],network=[];session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{const allowed=new URL(details.url).origin===new URL(target).origin;if(!allowed)network.push(details.url);callback({cancel:!allowed});});
  const win=new BrowserWindow({width:1440,height:1000,show:false,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const wc=win.webContents;wc.setBackgroundThrottling(false);wc.on('console-message',(_event,level,message)=>{if(level===3)failures.push(message);});
  const js=source=>wc.executeJavaScript(source,true);
  try{
    await win.loadURL(target);await until(()=>js("!!document.querySelector('#demo-incognito svg')"),'website enhanced');
    await js("document.querySelectorAll('.reveal').forEach(node=>node.classList.add('is-visible'))");
    await wait(900);
    const screenshot=async name=>{
      await js("document.getAnimations().forEach(animation=>{if(animation.effect.getTiming().iterations!==Infinity)animation.finish();})");
      await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const image=await wc.capturePage();fs.writeFileSync(path.join(output,name+'.png'),image.toPNG());
    };
    const overflow=async()=>{
      const metrics=await js("({width:innerWidth,scroll:document.documentElement.scrollWidth})");
      assert.ok(metrics.scroll<=metrics.width, 'no page horizontal overflow: '+JSON.stringify(metrics));
    };
    await overflow();await screenshot('desktop-hero');
    await js("document.querySelector('[data-scene=code]').click()");await until(()=>js("document.querySelector('#demo-mode-label').textContent==='Coding'"),'code example');
    await js("document.querySelector('#experience').scrollIntoView({block:'start',behavior:'instant'})");await screenshot('desktop-demo-code');
    await js("document.querySelector('[data-mode=design]').click()");assert.equal(await js("document.querySelector('#context-mode-title').textContent"),'System design');
    await js("document.querySelector('#visibility-slider').value=27;document.querySelector('#visibility-slider').dispatchEvent(new Event('input'))");assert.equal(await js("document.querySelector('#visibility-slider').getAttribute('aria-valuetext')"),'27 percent local view');
    await js("document.querySelector('#privacy').scrollIntoView({block:'start',behavior:'instant'})");await screenshot('desktop-privacy');
    await js("document.querySelector('[data-download]').click()");await until(()=>js("document.querySelector('#download-dialog').open"),'download chooser');assert.equal(await js("document.activeElement.closest('#download-dialog')!==null"),true,'modal traps initial focus');await screenshot('desktop-download');await js("document.querySelector('#download-close').click()");
    await js("document.querySelector('#film').scrollIntoView({block:'start',behavior:'instant'});document.querySelector('#film-start').click()");
    await until(()=>js("document.querySelector('#launch-film').currentTime>0.2"),'real MP4 playback');await js("document.querySelector('#launch-film').pause()");assert.equal(await js("document.querySelector('#launch-film').muted"),true);await screenshot('desktop-film');
    for(const width of [390,768]){
      win.setContentSize(width,844);await wait(180);await js("window.scrollTo({top:0,behavior:'instant'})");assert.equal(await js('scrollY'),0);await overflow();await screenshot(width===390?'mobile-hero':'tablet-hero');
      await js("document.querySelector('#privacy').scrollIntoView({block:'start',behavior:'instant'})");await overflow();await screenshot(width===390?'mobile-privacy':'tablet-privacy');
      await js("document.querySelector('[data-download]').click()");await screenshot(width===390?'mobile-download':'tablet-download');await js("document.querySelector('#download-close').click()");
    }
    assert.deepEqual(network,[],'demo does not contact AI providers or third parties');assert.deepEqual(failures,[],'no website console errors');
    clearTimeout(deadline);console.log('PASS: desktop/tablet/mobile rendering, synthetic demo tabs, mode choices, comparison, modal, MP4 playback, and no external requests.');app.quit();
  }catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
