/* An illustrated macOS walkthrough. No system settings, credentials or app data. */
import {createReplayLoop,pageReplayBudget,REPLAY_LIMIT} from './replay-loop.js'
(() => {
  'use strict'
  const query=new URLSearchParams(location.search)
  if(query.has('embed'))document.documentElement.classList.add('embed')
  if(query.has('capture'))document.documentElement.classList.add('capture')
  const one=selector=>document.querySelector(selector)
  const all=selector=>Array.from(document.querySelectorAll(selector))
  const motion=matchMedia('(prefers-reduced-motion: reduce)')
  const steps=[
    {start:0,end:3,preview:.6,label:'INSTALL',title:'Download the ZIP. Move Cue into Applications.',caption:'Choose Apple silicon or Intel. Unzip the downloaded archive.'},
    {start:3,end:6,preview:4.5,label:'DISMISS THE WARNING',title:'Choose Done. Keep the app in Applications.',caption:'For the unverified-developer warning, choose Done (or Cancel / OK), rather than Move to Bin or Trash.'},
    {start:6,end:10.5,preview:8.8,label:'PRIVACY & SECURITY',title:'System Settings → Privacy & Security → Open Anyway.',caption:'Scroll down to Security and find Cue’s blocked-app notice. Some macOS versions show Open first.'},
    {start:10.5,end:13,preview:11.6,label:'CONFIRM ON YOUR MAC',title:'Confirm Open. Authenticate if your Mac asks.',caption:'Use Touch ID or your Mac login password if prompted. This approval is for Cue.'},
    {start:13,end:15,preview:14.5,label:'YOUR MODEL',title:'Open Cue Settings. Add your own provider key.',caption:'Choose a provider, save your key, and start a conversation. Cue opens in incognito.'},
  ]
  const desktop=one('.desktop'),viewport=one('.viewport'),play=one('.play-control'),range=one('input[type="range"]'),pointer=one('.demo-pointer')
  let time=0,playing=false,frame=0,last=0,userControlled=false,previousStep=-1,runStarted=false,visible=true,resumeWhenVisible=false
  const loop=createReplayLoop({budget:pageReplayBudget(window,'first-launch'),replay:()=>{time=0;runStarted=false;start()},onChange:render})
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value))
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t)}
  const lerp=(a,b,t)=>a+(b-a)*t
  function target(selector){
    const rect=one(selector).getBoundingClientRect(),base=desktop.getBoundingClientRect(),scale=960/base.width
    return [(rect.left-base.left+rect.width/2)*scale,(rect.top-base.top+rect.height/2)*scale]
  }
  function cursor(from,to,progress,clickTime=-10){
    pointer.style.opacity='1'
    pointer.style.left=lerp(from[0],to[0],smooth(progress))+'px'
    pointer.style.top=lerp(from[1],to[1],smooth(progress))+'px'
    const pulse=clamp((time-clickTime)/.45),ring=one('.click-ring')
    ring.style.opacity=time>=clickTime&&time<clickTime+.45?String(.85*(1-pulse)):'0'
    ring.style.transform=`scale(${.45+pulse*.9})`
    pointer.querySelector('svg').style.transform=Math.abs(time-clickTime)<.09?'scale(.88)':'none'
  }
  function render(){
    const index=time>=15?4:steps.findIndex(step=>time>=step.start&&time<step.end),step=steps[index],local=time-step.start
    one('.player').dataset.time=time.toFixed(2)
    one('.player').dataset.playCount=String(loop.plays)
    one('.player').dataset.replayWaiting=String(loop.waiting)
    all('[data-scene]').forEach(scene=>scene.classList.toggle('is-active',Number(scene.dataset.scene)===index))
    desktop.classList.toggle('ready',index===4)
    desktop.classList.toggle('privacy-selected',index===2&&local>=.9)
    all('.click-focus').forEach(el=>el.classList.remove('click-focus'))
    one('[data-menu-app]').textContent=index===2?'System Settings':'Finder'
    one('[data-menu-file]').hidden=index===2
    one('[data-menu-help]').hidden=index!==2
    if(index!==previousStep){
      one('[data-step-label]').textContent=`0${index+1} / 05 · ${step.label}`
      one('[data-step-title]').textContent=step.title
      one('[data-step-caption]').textContent=step.caption
      all('[data-step]').forEach(button=>{if(Number(button.dataset.step)===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current')})
      previousStep=index
    }
    range.value=String(time)
    range.setAttribute('aria-valuetext',`${Math.floor(time)} seconds, ${step.title}`)
    one('.time').textContent=`0:${String(Math.floor(time)).padStart(2,'0')} / 0:15`
    const active=playing||loop.waiting
    play.setAttribute('aria-label',active?'Pause the installation walkthrough':time>=15?'Replay the installation walkthrough':'Play the 15-second installation walkthrough')
    one('[data-play-icon]').textContent=active?'Ⅱ':time>=15?'↻':'▶'
    one('[data-play-text]').textContent=active?'Pause':time>=15?'Replay':'Play'
    const dragged=one('.dragged-app'),dragProgress=smooth((local-.8)/1.3)
    dragged.style.opacity=index===0&&local>=.8&&local<2.5?'1':'0'
    dragged.style.transform=`translateX(${dragProgress*300}px) scale(1.04)`
    one('.installer-app img').style.opacity=index===0&&local>=.8&&local<2.5?'.3':'1'
    one('.settings-content').style.transform=`translateY(${-smooth((local-1.3)/1.05)*168}px)`
    if(index===0)cursor(local<.8?[410,405]:[338,300],local<.8?[338,300]:[638,300],local<.8?local/.7:(local-.8)/1.3,.8)
    else if(index===1){cursor([639,355],target('[data-target="done"]'),local/1.2,5.1);if(local>=2.1&&local<2.55)one('[data-target="done"]').classList.add('click-focus')}
    else if(index===2){
      const privacy=target('[data-target="privacy"]'),anyway=target('[data-target="anyway"]')
      if(local<1.3)cursor([411,292],privacy,local/.85,6.9)
      else cursor(privacy,anyway,(local-1.7)/1.2,9.5)
      if(local>=3.5&&local<4)one('[data-target="anyway"]').classList.add('click-focus')
    }else if(index===3){cursor([684,384],target('[data-target="open"]'),local/.9,12.1);if(local>=1.6&&local<2.1)one('[data-target="open"]').classList.add('click-focus')}
    else{cursor([675,170],target('.ready-panel'),local/.8,13.9);pointer.style.opacity=String(1-smooth((local-1.1)/.5))}
  }
  function tick(now){
    if(!playing)return
    time=clamp(time+(now-last)/1000,0,15);last=now
    if(time>=15){playing=false;runStarted=false;if(!motion.matches&&!query.has('capture'))loop.finish()}
    render()
    if(playing)frame=requestAnimationFrame(tick)
  }
  function pause(manual=true){playing=false;cancelAnimationFrame(frame);if(manual){resumeWhenVisible=false;loop.cancel()}render()}
  function start(){
    loop.cancel();resumeWhenVisible=false
    if(time>=15){time=0;runStarted=false}
    if(!runStarted){loop.begin();runStarted=true}
    playing=true;last=performance.now();render();frame=requestAnimationFrame(tick)
  }
  play.addEventListener('click',()=>{userControlled=true;if(playing||loop.waiting)pause();else start()})
  one('.restart-control').addEventListener('click',()=>{userControlled=true;pause();time=0;runStarted=false;start()})
  range.addEventListener('input',()=>{const next=Number(range.value);userControlled=true;pause();time=clamp(next,0,15);runStarted=false;render()})
  all('[data-step]').forEach(button=>button.addEventListener('click',()=>{userControlled=true;pause();time=steps[Number(button.dataset.step)].preview;runStarted=false;render()}))
  function resize(){
    desktop.style.transform=`scale(${viewport.clientWidth/960})`
    if(window!==parent)parent.postMessage({cueInstallGuide:{height:document.body.scrollHeight}},location.origin)
  }
  if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(one('.player'))
  addEventListener('resize',resize)
  addEventListener('keydown',event=>{
    if(event.key==='Escape'&&window!==parent){event.preventDefault();parent.postMessage({cueInstallGuide:{close:true}},location.origin)}
  })
  function availability(){
    const available=visible&&!document.hidden
    loop.setEnabled(available&&!motion.matches)
    if(!available&&playing){resumeWhenVisible=true;pause(false)}
    else if(available&&resumeWhenVisible){resumeWhenVisible=false;start()}
  }
  document.addEventListener('visibilitychange',availability)
  if(typeof IntersectionObserver==='function')new IntersectionObserver(entries=>{
    visible=entries.some(entry=>entry.isIntersecting);availability()
    if(visible&&!document.hidden&&!userControlled&&!motion.matches&&!query.has('capture')&&time===0&&!runStarted&&loop.plays<REPLAY_LIMIT)start()
  },{threshold:.35}).observe(one('.film'))
  motion.addEventListener('change',()=>{if(motion.matches)pause();availability()})
  resize();render();availability()
})()
