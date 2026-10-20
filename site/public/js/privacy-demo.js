// Replay the illustrated eye-to-incognito interaction when its toolbar enters view.
export function setupPrivacyDemo(demo) {
  const button = demo.querySelector('#demo-incognito');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const cursor = document.createElement('div');
  cursor.className = 'demo-cursor';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = '<span class="demo-click-ring"></span><svg class="demo-cursor-glyph" viewBox="0 0 28 36" fill="none" focusable="false"><path d="M4 2v26l6.3-6.7 5 11 4-2.1-5.1-10.3H24L4 2Z" fill="#f7f8fb" stroke="#101215" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  demo.append(cursor);
  const notice = document.createElement('div');
  notice.className = 'demo-privacy-notice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-atomic', 'true');
  demo.append(notice);
  const timers = new Set(), animations = new Set();
  let eligible = false, armed = true, interacted = false;
  let noticeTimer;

  function hideNotice() {
    clearTimeout(noticeTimer);
    notice.hidden = true;
    notice.textContent = '';
  }
  function showNotice() {
    clearTimeout(noticeTimer);
    notice.hidden = false;
    notice.textContent = 'Cue is invisible/undetectable in screen share.';
    noticeTimer = setTimeout(hideNotice, 4800);
  }
  function setPrivacy(enabled, notify = false) {
    button.setAttribute('aria-pressed', String(enabled));
    demo.classList.toggle('demo-protected', enabled);
    demo.classList.toggle('demo-detectable', !enabled);
    if (!enabled) hideNotice();
    else if (notify) showNotice();
  }
  function stop(state = 'idle') {
    cursor.hidden = true;
    timers.forEach(clearTimeout); timers.clear();
    animations.forEach(animation => animation.cancel()); animations.clear();
    button.classList.remove('demo-auto-hover', 'demo-auto-press');
    if (state !== 'complete') hideNotice();
    demo.dataset.privacyDemo = state;
  }
  function after(delay, action) {
    const timer = setTimeout(() => { timers.delete(timer); action(); }, delay);
    timers.add(timer);
  }
  function animate(element, frames, options) {
    const animation = element.animate(frames, options);
    animations.add(animation);
    return animation;
  }
  function play() {
    if (motion.matches || document.hidden || interacted || demo.contains(document.activeElement)) return;
    armed = false;
    stop('ready');
    setPrivacy(false);
    after(360, () => {
      const scene = demo.getBoundingClientRect(), target = button.getBoundingClientRect();
      const scaleX = scene.width / demo.offsetWidth, scaleY = scene.height / demo.offsetHeight;
      const x = (target.left + target.width / 2 - scene.left) / scaleX - demo.clientLeft - 4;
      const y = (target.top + target.height / 2 - scene.top) / scaleY - demo.clientTop - 2;
      const startX = Math.min(demo.clientWidth - 35, x + 130), startY = Math.min(demo.clientHeight - 40, y + 105);
      cursor.hidden = false;
      demo.dataset.privacyDemo = 'moving';
      animate(cursor, [
        { transform: `translate(${startX}px,${startY}px)`, opacity: 0 },
        { transform: `translate(${startX - 10}px,${startY - 6}px)`, opacity: 1, offset: .15 },
        { transform: `translate(${x}px,${y}px)`, opacity: 1 }
      ], { duration: 1000, easing: 'cubic-bezier(.22,.75,.25,1)', fill: 'forwards' });
    });
    after(1360, () => { button.classList.add('demo-auto-hover'); demo.dataset.privacyDemo = 'aimed'; });
    after(1510, () => {
      button.classList.add('demo-auto-press');
      animate(cursor.querySelector('svg'), [{ transform: 'scale(1)' }, { transform: 'scale(.84)', offset: .45 }, { transform: 'scale(1)' }], { duration: 220 });
      animate(cursor.querySelector('.demo-click-ring'), [{ opacity: .8, transform: 'translate(-50%,-50%) scale(.45)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(2.3)' }], { duration: 550 });
      setPrivacy(true, true);
      demo.dataset.privacyDemo = 'protected';
    });
    after(1730, () => button.classList.remove('demo-auto-press'));
    after(2060, () => animate(cursor, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }));
    after(2300, () => stop('complete'));
  }
  function pauseForInteraction() { interacted = true; stop('interactive'); }
  demo.addEventListener('pointerdown', pauseForInteraction, { capture: true });
  demo.addEventListener('keydown', pauseForInteraction, { capture: true });
  demo.addEventListener('focusin', pauseForInteraction);
  button.addEventListener('click', () => { stop('interactive'); setPrivacy(button.getAttribute('aria-pressed') !== 'true', true); });
  motion.addEventListener('change', () => {
    stop();
    if (motion.matches) { setPrivacy(true); demo.dataset.privacyDemo = 'reduced-motion'; }
    else if (eligible && !interacted) play();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); armed = true; }
    else if (eligible && armed && !interacted) play();
  });
  addEventListener('pagehide', () => { stop(); armed = true; });
  addEventListener('resize', () => {
    if (['moving', 'aimed', 'protected'].includes(demo.dataset.privacyDemo)) { stop('complete'); setPrivacy(true); }
  });
  if (typeof IntersectionObserver === 'function' && typeof cursor.animate === 'function') {
    new IntersectionObserver(entries => {
      const entry = entries[0];
      if (!entry.isIntersecting || entry.intersectionRatio <= .05) {
        eligible = false; armed = true; interacted = false; stop(); return;
      }
      eligible = entry.intersectionRatio >= .8;
      if (eligible && armed) play();
    }, { threshold: [0, .05, .8, 1], rootMargin: '-90px 0px -12% 0px' }).observe(button);
  }
  if (motion.matches) demo.dataset.privacyDemo = 'reduced-motion';
}
