// Copyright © 2026 dumpydon. SPDX-License-Identifier: AGPL-3.0-only
// Play only while visible. Explicit pause lasts until a new visit or hover.
export function setupFilmPlayers(root=document){
  const motion=matchMedia('(prefers-reduced-motion: reduce)')
  const controllers=[]
  const players=Array.from(root.querySelectorAll('[data-film-player]'))
  const refresh=()=>controllers.forEach(controller=>controller.refresh())
  players.forEach((player,index)=>{
    const video=player.querySelector('video'),toggle=player.querySelector('.film-toggle')
    const restart=player.querySelector('.film-restart'),controls=player.querySelector('.film-main-controls')
    const tools=player.querySelector('.film-tools'),sound=player.querySelector('.film-sound')
    const fullscreen=player.querySelector('.film-fullscreen'),error=player.querySelector('.film-error')
    const timeline=player.querySelector('.film-timeline'),seek=timeline?.querySelector('.film-seek')
    const elapsed=timeline?.querySelector('.film-time-current'),total=timeline?.querySelector('.film-time-duration')
    let visible=false,manuallyPaused=false,failed=false,request=0,hoverTimer,automaticPlayback=false
    let scrubbing=false,resumeAfterSeek=false,scrubPointer=null
    video.id='cue-film-'+index
    video.defaultMuted=true;video.muted=true
    for(const button of [toggle,restart])button.setAttribute('aria-controls',video.id)
    seek?.setAttribute('aria-controls',video.id)
    function duration(){return Number.isFinite(video.duration)&&video.duration>0?video.duration:0}
    function timestamp(value){
      const seconds=Math.floor(Math.max(0,Number.isFinite(value)?value:0))
      return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')
    }
    function syncTimeline(){
      if(!seek)return
      const length=duration(),position=Math.max(0,Math.min(length,scrubbing?Number(seek.value):video.currentTime||0))
      seek.disabled=!length||failed;seek.max=String(length)
      if(!scrubbing)seek.value=String(position)
      seek.style.setProperty('--film-progress',length?position/length*100+'%':'0%')
      elapsed.textContent=timestamp(position);total.textContent=length?timestamp(length):'--:--'
      seek.setAttribute('aria-valuetext',length?timestamp(position)+' of '+timestamp(length):'Video loading')
    }
    function sync(){
      const state=video.paused||video.ended?'play':'pause'
      const action=state==='play'?'Play':'Pause'
      toggle.setAttribute('aria-label',action+' Cue launch film');toggle.title=action
      player.dataset.playback=video.ended?'ended':state
      toggle.querySelectorAll('[data-film-icon]').forEach(icon=>icon.toggleAttribute('hidden',icon.dataset.filmIcon!==state))
      const audioAction=video.muted?'Unmute':'Mute'
      sound.setAttribute('aria-label',audioAction+' Cue launch film');sound.title=audioAction
      sound.querySelectorAll('[data-sound-icon]').forEach(icon=>icon.toggleAttribute('hidden',icon.dataset.soundIcon!==(video.muted?'off':'on')))
      syncTimeline()
    }
    function available(){
      if(document.hidden||failed)return false
      const dialog=player.closest('dialog'),openDialog=root.querySelector('dialog[open]')
      if(dialog&&!dialog.open||openDialog&&!openDialog.contains(player))return false
      const box=player.getBoundingClientRect()
      return box.width>0&&box.height>0&&box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth
    }
    function pause(){request++;clearTimeout(hoverTimer);video.pause()}
    async function play({fromStart=false,automatic=false}={}){
      if(!available()||scrubbing||automatic&&(motion.matches||!visible||manuallyPaused))return
      if(!video.paused&&!video.ended&&!fromStart)return
      const attempt=++request
      clearTimeout(hoverTimer);error.hidden=true
      controllers.forEach(other=>{if(other.player!==player)other.pause()})
      if(fromStart||video.ended)video.currentTime=0
      automaticPlayback=automatic
      try{
        await video.play()
      }catch(reason){
        if(attempt!==request||reason.name==='AbortError')return
        // Sound may be enabled by the viewer; retry silently if autoplay needs mute.
        if(automatic&&reason.name==='NotAllowedError'&&!video.muted){
          video.muted=true
          try{await video.play()}catch{/* Leave the play button available. */}
        }else if(!automatic)error.hidden=false
      }
      if(attempt===request&&!available())pause()
      sync()
    }
    function manualPlay(fromStart=false){
      clearTimeout(hoverTimer);manuallyPaused=false
      void play({fromStart})
    }
    function togglePlayback(){
      clearTimeout(hoverTimer)
      if(!video.paused&&!video.ended){manuallyPaused=true;pause()}
      else manualPlay()
    }
    function beginScrub(){
      if(scrubbing||!duration())return
      resumeAfterSeek=!video.paused&&!video.ended
      scrubbing=true;manuallyPaused=true;pause()
    }
    function seekTo(value){
      if(!duration()||!Number.isFinite(value))return
      const position=Math.max(0,Math.min(duration(),value))
      seek.value=String(position);video.currentTime=position;syncTimeline()
    }
    function finishScrub(){
      if(!scrubbing)return
      scrubbing=false
      const resume=resumeAfterSeek;resumeAfterSeek=false
      if(resume&&video.currentTime<duration()&&available())manualPlay()
      else sync()
    }
    function setVisibility(ratio){
      const next=ratio>=.25?true:ratio<=.1?false:visible
      const entering=next&&!visible
      visible=next;player.dataset.visibility=visible?'in-view':'out-of-view'
      if(!visible){manuallyPaused=false;pause();return}
      if(entering){manuallyPaused=false;void play({automatic:true,fromStart:video.ended})}
      else if(!video.ended)void play({automatic:true})
    }
    controllers.push({player,pause,refresh(){
      if(!available()||motion.matches&&automaticPlayback){pause();return}
      if(visible&&!video.ended)void play({automatic:true})
    }})
    if(typeof IntersectionObserver==='function'){
      new IntersectionObserver(entries=>{
        for(const entry of entries)setVisibility(entry.intersectionRatio)
      },{threshold:[0,.1,.25,.5,1]}).observe(player)
    }else{
      const measure=()=>{const box=player.getBoundingClientRect();setVisibility(box.height?Math.max(0,Math.min(box.bottom,innerHeight)-Math.max(0,box.top))/box.height:0)}
      addEventListener('scroll',measure,{passive:true});addEventListener('resize',measure);measure()
    }
    player.addEventListener('pointerenter',event=>{
      if(event.pointerType!=='mouse')return
      clearTimeout(hoverTimer)
      hoverTimer=setTimeout(()=>{manuallyPaused=false;void play({automatic:true,fromStart:video.ended})},150)
    })
    player.addEventListener('pointerleave',()=>clearTimeout(hoverTimer))
    if(seek){
      // Entering the timeline must not restart a paused film through hover autoplay.
      timeline.addEventListener('pointerenter',()=>clearTimeout(hoverTimer))
      timeline.addEventListener('focusin',()=>clearTimeout(hoverTimer))
      seek.addEventListener('pointerdown',event=>{
        if(seek.disabled||event.pointerType==='mouse'&&event.button!==0)return
        scrubPointer=event.pointerId;beginScrub();seek.setPointerCapture(event.pointerId)
      })
      seek.addEventListener('input',()=>{
        beginScrub();seekTo(Number(seek.value))
        // Keyboard and accessibility input have no active pointer to wait for.
        if(scrubPointer===null)finishScrub()
      })
      const release=event=>{
        if(scrubPointer!==null&&event.pointerId!==scrubPointer)return
        scrubPointer=null;finishScrub()
      }
      for(const event of ['pointerup','pointercancel','lostpointercapture'])seek.addEventListener(event,release)
      seek.addEventListener('blur',()=>{scrubPointer=null;finishScrub()})
      seek.addEventListener('keydown',event=>{
        if(seek.disabled)return
        const step=event.shiftKey?5:1
        const positions={ArrowLeft:Number(seek.value)-step,ArrowDown:Number(seek.value)-step,ArrowRight:Number(seek.value)+step,ArrowUp:Number(seek.value)+step,PageDown:Number(seek.value)-5,PageUp:Number(seek.value)+5,Home:0,End:duration()}
        if(!(event.key in positions))return
        event.preventDefault();beginScrub();seekTo(positions[event.key])
        if(scrubPointer===null)finishScrub()
      })
    }
    toggle.addEventListener('click',togglePlayback)
    restart.addEventListener('click',()=>manualPlay(true))
    video.addEventListener('click',()=>{if(player.classList.contains('film-enhanced'))togglePlayback()})
    sound.addEventListener('click',()=>{video.muted=!video.muted})
    fullscreen.addEventListener('click',async()=>{
      try{
        if(document.fullscreenElement===player)await document.exitFullscreen()
        else if(player.requestFullscreen)await player.requestFullscreen()
        else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen()
      }catch{/* Keep the inline player usable if full screen is unavailable. */}
    })
    document.addEventListener('fullscreenchange',()=>{
      const active=document.fullscreenElement===player
      fullscreen.setAttribute('aria-label',(active?'Exit full screen for':'Show')+' Cue launch film'+(active?'':' full screen'))
      fullscreen.title=active?'Exit full screen':'Full screen'
    })
    for(const event of ['play','pause','ended','volumechange','loadedmetadata','seeked'])video.addEventListener(event,sync)
    for(const event of ['timeupdate','durationchange','emptied'])video.addEventListener(event,syncTimeline)
    video.addEventListener('error',()=>{
      failed=true;pause();error.hidden=false;video.controls=true;controls.hidden=true;tools.hidden=true;player.classList.remove('film-enhanced')
      if(timeline)timeline.hidden=true
    })
    // Native controls remain available when JavaScript is unavailable or media fails.
    video.controls=false;controls.hidden=false;tools.hidden=false;if(timeline)timeline.hidden=false;player.classList.add('film-enhanced');sync()
  })
  document.addEventListener('visibilitychange',refresh)
  addEventListener('pageshow',refresh)
  motion.addEventListener('change',refresh)
  return refresh
}
