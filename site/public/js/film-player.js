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
    let visible=false,manuallyPaused=false,failed=false,request=0,hoverTimer,automaticPlayback=false
    video.id='cue-film-'+index
    video.defaultMuted=true;video.muted=true
    for(const button of [toggle,restart])button.setAttribute('aria-controls',video.id)
    function sync(){
      const state=video.paused||video.ended?'play':'pause'
      const action=state==='play'?'Play':'Pause'
      toggle.setAttribute('aria-label',action+' Cue launch film');toggle.title=action
      player.dataset.playback=video.ended?'ended':state
      toggle.querySelectorAll('[data-film-icon]').forEach(icon=>icon.toggleAttribute('hidden',icon.dataset.filmIcon!==state))
      const audioAction=video.muted?'Unmute':'Mute'
      sound.setAttribute('aria-label',audioAction+' Cue launch film');sound.title=audioAction
      sound.querySelectorAll('[data-sound-icon]').forEach(icon=>icon.toggleAttribute('hidden',icon.dataset.soundIcon!==(video.muted?'off':'on')))
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
      if(!available()||automatic&&(motion.matches||!visible||manuallyPaused))return
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
    video.addEventListener('error',()=>{
      failed=true;pause();error.hidden=false;video.controls=true;controls.hidden=true;tools.hidden=true;player.classList.remove('film-enhanced')
    })
    // Native controls remain available when JavaScript is unavailable or media fails.
    video.controls=false;controls.hidden=false;tools.hidden=false;player.classList.add('film-enhanced');sync()
  })
  document.addEventListener('visibilitychange',refresh)
  addEventListener('pageshow',refresh)
  motion.addEventListener('change',refresh)
  return refresh
}
