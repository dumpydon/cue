/* Cue's public website. All product demo content is synthetic and local. */
(() => {
  const paths = {
    download:'<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>',
    'arrow-down':'<path d="M12 4v16m-6-6 6 6 6-6"/>',
    'arrow-up':'<path d="M12 20V4m-6 6 6-6 6 6"/>',
    'arrow-up-right':'<path d="M5 19 19 5M5 5h14v14"/>',
    play:'<path d="m8 4 12 8-12 8Z"/>',pause:'<path d="M8 4v16M16 4v16"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',
    settings:'<path d="m10 3-1 3-3 1-3 3 2 3v4l4 1 3 3 3-2h4l1-4 3-3-2-3V5l-4-1-3-1Z"/><circle cx="12" cy="12" r="3"/>',
    incognito:'<path d="M2 10h20M4 10l2-7 6 1 6-1 2 7"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M10 17h4"/>',
    eye:'<path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    'chevron-down':'<path d="m5 9 7 7 7-7"/>',
    mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    camera:'<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 9 6-4v14l-6-4"/>',
    messages:'<path d="M21 15a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/>',
    code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
    sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4"/>',
    audio:'<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h6"/>',
    monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v5M7 22h10"/>',
    'move-horizontal':'<path d="M3 12h18m-4-4 4 4-4 4M7 8l-4 4 4 4"/>',
    users:'<circle cx="9" cy="7" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 3a4 4 0 0 1 0 8M22 22v-3a7 7 0 0 0-4-6"/>',
    sliders:'<path d="M4 21v-7M4 10V3M12 21V11M12 7V3M20 21v-3M20 14V3M1 10h6M9 11h6M17 18h6"/>',
    zap:'<path d="m13 2-3 8H4l7 12 3-9h6Z"/>',
    'hard-drive':'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 14h18M7 17h.01M11 17h.01"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
    restart:'<path d="M3 10a9 9 0 1 1 1 8M3 3v7h7"/>',
    expand:'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
    'volume-off':'<path d="m11 5-6 4H2v6h3l6 4ZM17 9l5 6M17 15l5-6"/>',
    volume:'<path d="m11 5-6 4H2v6h3l6 4ZM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>',
    apple:'<path d="M14.6 5.3c.9-1.1.9-2.5.9-2.9-1.4.1-2.8.9-3.6 1.8-.8.9-1.3 2.1-1.1 3.4 1.3.1 2.8-.6 3.8-2.3ZM19.8 17.4c-.5 1.2-.8 1.8-1.5 2.9-.9 1.3-2.1 3-3.6 3-1.3 0-1.7-.9-3.4-.9s-2.1.9-3.4.9c-1.5 0-2.6-1.5-3.5-2.8-2.5-3.8-2.8-8.3-1.3-10.7 1.1-1.8 2.9-2.8 4.5-2.8 1.4 0 2.4.9 3.5.9 1.1 0 2-1 3.6-1 1.4 0 2.9.8 4 2.2-3.5 1.9-2.9 6.8 1.1 8.3Z"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="${name==='apple'?'currentColor':'none'}" stroke="${name==='apple'?'none':'currentColor'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
  const paintIcons = root => root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  paintIcons(document);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js');
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveal.unobserve(entry.target); } }), {threshold:.08});
    document.querySelectorAll('.reveal').forEach(node => reveal.observe(node));
  }
  const navigation = document.querySelector('#navigation');
  const updateNav = () => navigation?.classList.toggle('scrolled', scrollY > 30);
  addEventListener('scroll', updateNav, {passive:true}); updateNav();
  const menuToggle = document.querySelector('.menu-toggle'), mobileMenu = document.querySelector('#mobile-menu');
  menuToggle?.addEventListener('click', () => { const open = menuToggle.getAttribute('aria-expanded') !== 'true'; menuToggle.setAttribute('aria-expanded', String(open)); mobileMenu.hidden = !open; });
  mobileMenu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { mobileMenu.hidden=true; menuToggle.setAttribute('aria-expanded','false'); }));
  addEventListener('keydown', event => { if (event.key==='Escape' && mobileMenu && !mobileMenu.hidden) { mobileMenu.hidden=true; menuToggle.setAttribute('aria-expanded','false'); menuToggle.focus(); } });

  const scenes = {
    conversation:{mode:'General',question:'How should we prioritize the launch?',response:'<p><strong>I’d focus on one thing first:</strong> making the core experience feel effortless.</p><p>Then I’d validate it with a small group, learn what gets in their way, and use that to shape the next release.</p>',transcript:'Them: What should we focus on for the first release?'},
    code:{mode:'Coding',question:'Find the maximum average of a subarray of length k.',response:'<p>Use a <strong>sliding window</strong>. Update the running sum as each element enters and leaves.</p><pre><code><span class="syntax-purple">for</span> right <span class="syntax-purple">in</span> range(k, len(nums)):\n    total += nums[right] - nums[right-k]\n    best = max(best, total)</code></pre><p>Time <strong>O(n)</strong> · Space <strong>O(1)</strong></p>',transcript:'Them: Can you explain a more efficient approach?'},
    concept:{mode:'Explain',question:'Why does compound interest grow so quickly?',response:'<p>Because you earn interest on <strong>both the starting amount and the interest already earned.</strong></p><p>Think of it as a snowball: the base gets bigger each round, so the next addition grows too.</p><p><span class="demo-equation">A = P(1 + r)<sup>t</sup></span></p>',transcript:'Them: Could you explain that in a simpler way?'}
  };
  const demo = document.querySelector('#cue-demo');
  let sceneTimer;
  document.querySelectorAll('[data-scene]').forEach((button,index,buttons) => {
    button.addEventListener('click', () => {
      const scene = scenes[button.dataset.scene]; if (!scene) return;
      buttons.forEach(item => { const selected=item===button; item.setAttribute('aria-selected',String(selected)); item.tabIndex=selected?0:-1; });
      clearTimeout(sceneTimer); demo.classList.add('scene-changing');
      const paint = () => {
        document.querySelector('#demo-mode-label').textContent=scene.mode;
        document.querySelector('#demo-question').textContent=scene.question;
        document.querySelector('#demo-response').innerHTML=scene.response;
        document.querySelector('#demo-transcript-text').textContent=scene.transcript;
        demo.classList.remove('scene-changing');
      };
      if (reduceMotion.matches) paint(); else sceneTimer=setTimeout(paint,150);
    });
    button.tabIndex=index===0?0:-1;
    button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();});
  });
  document.querySelector('#demo-incognito')?.addEventListener('click',event=>{
    const button=event.currentTarget, enabled=button.getAttribute('aria-pressed')!=='true';
    button.setAttribute('aria-pressed',String(enabled)); demo.classList.toggle('detectable',!enabled); button.innerHTML=icon(enabled?'incognito':'eye');
  });
  const modes = {
    interview:['Interview','Help me answer naturally. Use my background as the source of truth. Keep the reply focused and easy to say out loud.','Resume.pdf'],
    design:['System design','Help me clarify requirements, explain the tradeoffs, and develop a practical design. State assumptions and focus on the bottlenecks.','Project-brief.pdf'],
    meeting:['Team meeting','Help me keep track of decisions, open questions, and next steps. Ground every recap in what was actually discussed.','Meeting-notes.txt']
  };
  document.querySelectorAll('.mode-choice').forEach(button=>button.addEventListener('click',()=>{
    const [title,copy,file]=modes[button.dataset.mode];
    document.querySelectorAll('.mode-choice').forEach(item=>{const selected=item===button;item.classList.toggle('active',selected);item.setAttribute('aria-pressed',String(selected));});
    document.querySelector('#context-mode-title').textContent=title;document.querySelector('#context-mode-copy').textContent=copy;
    const filename=document.querySelector('#context-file-name');filename.replaceChildren(document.createTextNode(file));const small=document.createElement('small');small.textContent='Reference context';filename.append(small);
  }));
  const slider=document.querySelector('#visibility-slider');
  slider?.addEventListener('input',()=>{const value=Math.max(0,Math.min(100,Number(slider.value)));document.querySelector('#comparison').style.setProperty('--split',value+'%');slider.setAttribute('aria-valuetext',value+' percent local view');});

  const film=document.querySelector('#launch-film');
  if(film){
    const start=document.querySelector('#film-start'), controls=document.querySelector('#film-controls'), play=document.querySelector('#film-play'), sound=document.querySelector('#film-sound'), seek=document.querySelector('#film-progress'), time=document.querySelector('#film-time');
    const timestamp=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
    const paintPlayer=()=>{play.innerHTML=icon(film.paused?'play':'pause');play.setAttribute('aria-label',film.paused?'Play film':'Pause film');seek.max=String(film.duration||27);seek.value=String(film.currentTime||0);seek.setAttribute('aria-valuetext',timestamp(film.currentTime||0));time.textContent=timestamp(film.currentTime||0)+' / '+timestamp(film.duration||27);};
    film.controls=false;
    const begin=async()=>{start.hidden=true;controls.hidden=false;try{await film.play();}catch{film.controls=true;start.hidden=true;controls.hidden=true;}paintPlayer();};
    start.addEventListener('click',begin);play.addEventListener('click',()=>film.paused?begin():film.pause());
    document.querySelector('#film-restart').addEventListener('click',()=>{film.currentTime=0;void begin();});
    sound.addEventListener('click',()=>{film.muted=!film.muted;sound.setAttribute('aria-pressed',String(!film.muted));sound.setAttribute('aria-label',film.muted?'Unmute film':'Mute film');sound.innerHTML=icon(film.muted?'volume-off':'volume');});
    document.querySelector('#film-captions').addEventListener('click',event=>{const track=film.textTracks[0];if(!track)return;const enabled=track.mode!=='showing';track.mode=enabled?'showing':'hidden';event.currentTarget.setAttribute('aria-pressed',String(enabled));event.currentTarget.setAttribute('aria-label',enabled?'Hide captions':'Show captions');});
    seek.addEventListener('input',()=>{film.currentTime=Math.min(film.duration||27,Number(seek.value));paintPlayer();});
    document.querySelector('#film-fullscreen').addEventListener('click',()=>{const result=film.parentElement.requestFullscreen?.();result?.catch(()=>{film.controls=true;});});
    for(const event of ['timeupdate','play','pause','loadedmetadata','ended'])film.addEventListener(event,paintPlayer);
    document.querySelectorAll('[data-watch]').forEach(button=>button.addEventListener('click',()=>{setTimeout(begin,reduceMotion.matches?0:450);}));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause();});
    if('IntersectionObserver' in window)new IntersectionObserver(entries=>{if(entries[0].intersectionRatio<.08&&!film.paused)film.pause();},{threshold:[0,.08]}).observe(film);
  }

  const dialog=document.querySelector('#download-dialog');
  let previousFocus,releasePromise;
  async function loadRelease(){
    if(!releasePromise)releasePromise=fetch('/release.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw Error('Release information unavailable');return response.json();});
    try{
      const release=await releasePromise;
      const available=Object.values(release.assets||{}).some(asset=>asset.url);
      document.querySelector('#release-status').textContent=available?`Cue ${release.version} · Developer preview · macOS ${release.minimumMacOS}+`:'The Mac preview is being packaged. The complete source is available now.';
      for(const arch of ['arm64','x64']){
        const link=document.querySelector('#download-'+arch),asset=release.assets?.[arch];if(!link)continue;
        if(asset?.url){link.href=asset.url;link.removeAttribute('aria-disabled');link.removeAttribute('tabindex');link.querySelector('small').textContent=(arch==='arm64'?'Apple silicon':'Intel')+' · '+Math.ceil(asset.bytes/1048576)+' MB · '+(asset.filename?.endsWith('.dmg')?'DMG':'ZIP');}
        else{link.setAttribute('aria-disabled','true');link.tabIndex=-1;link.querySelector('small').textContent=arch==='x64'?'Intel preview preparing':'Apple silicon preview preparing';}
      }
    }catch{document.querySelector('#release-status').textContent='Release details could not be loaded. You can still explore or download the source below.';releasePromise=null;}
  }
  document.querySelectorAll('[data-download]').forEach(button=>button.addEventListener('click',event=>{if(!dialog?.showModal)return;event.preventDefault();previousFocus=document.activeElement;dialog.showModal();void loadRelease();}));
  document.querySelectorAll('.download-option').forEach(link=>link.addEventListener('click',event=>{if(link.getAttribute('aria-disabled')==='true')event.preventDefault();}));
  document.querySelector('#download-close')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
  dialog?.addEventListener('close',()=>previousFocus?.focus());
})();
