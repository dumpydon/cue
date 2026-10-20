// A local illustration: dragging never moves a native window or captures a meeting.
export function setupDesktopDemo() {
  const section = document.querySelector('.hero-experience');
  const stage = section?.querySelector('.desktop-stage');
  if (!stage) return () => {};
  const floating = stage.querySelector('[data-desktop-window]');
  const toolbar = floating.querySelector('.cue-toolbar');
  const handle = floating.querySelector('[data-desktop-drag]');
  const panel = floating.querySelector('.cue-window');
  const collapse = floating.querySelector('.desktop-collapse');
  const video = stage.querySelector('video');
  const toggle = section.querySelector('[data-desktop-video-toggle]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const windowScale = .7475;
  floating.style.setProperty('--cue-scale', String(windowScale));
  let x = 0, y = 0, moved = false, drag = null;
  let visible = false, playbackChoice = null;

  function limits() {
    return { left: 10, top: 42,
      right: Math.max(10, stage.clientWidth - floating.offsetWidth * windowScale - 10),
      bottom: Math.max(42, stage.clientHeight - floating.offsetHeight * windowScale - 72) };
  }
  function place(nextX, nextY) {
    const bounds = limits();
    x = Math.max(bounds.left, Math.min(bounds.right, nextX));
    y = Math.max(bounds.top, Math.min(bounds.bottom, nextY));
    floating.style.setProperty('--cue-x', x.toFixed(2) + 'px');
    floating.style.setProperty('--cue-y', y.toFixed(2) + 'px');
  }
  function layout() {
    panel.style.maxHeight = Math.max(180, Math.min(400,
      stage.clientHeight - 42 - 72 - toolbar.offsetHeight - 12)) + 'px';
    if (moved) place(x, y);
    else place((stage.clientWidth - floating.offsetWidth * windowScale) / 2, stage.clientHeight * .09);
  }
  function finishDrag(event) {
    if (!drag || event?.pointerId !== undefined && event.pointerId !== drag.id) return;
    const id = drag.id;
    drag = null;
    stage.classList.remove('is-dragging');
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
  }
  stage.classList.add('has-desktop-js');
  layout();
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button,a,input,select,textarea,pre,code')) return;
    event.preventDefault();
    moved = true;
    const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
    drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y, scale };
    handle.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    place(drag.x + (event.clientX - drag.clientX) / drag.scale,
      drag.y + (event.clientY - drag.clientY) / drag.scale);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, finishDrag);
  handle.addEventListener('keydown', event => {
    if (event.target !== handle) return;
    if (event.key === 'Home') { event.preventDefault(); moved = false; layout(); return; }
    const step = event.shiftKey ? 50 : 16;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault(); moved = true; place(x + delta[0], y + delta[1]);
  });
  collapse.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    collapse.setAttribute('aria-expanded', String(!panel.hidden));
    collapse.textContent = panel.hidden ? '⌃  Show' : '⌄  Hide';
    layout();
  });
  section.querySelectorAll('[data-desktop-reset]').forEach(button => button.addEventListener('click', () => {
    finishDrag(); panel.hidden = false; collapse.setAttribute('aria-expanded', 'true');
    collapse.textContent = '⌄  Hide'; moved = false; layout();
  }));
  addEventListener('resize', () => { finishDrag(); layout(); });
  addEventListener('blur', () => finishDrag());
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(layout);
    observer.observe(stage); observer.observe(floating);
  }
  section.querySelector('.desktop-drag-hint').hidden = false;
  section.querySelector('.desktop-demo-controls').hidden = false;

  video.controls = false;
  video.muted = true;
  function syncToggle() {
    toggle.textContent = video.paused ? 'Play meeting' : 'Pause meeting';
    toggle.setAttribute('aria-pressed', String(!video.paused));
  }
  function refreshPlayback() {
    const wantsPlayback = playbackChoice ?? !motion.matches;
    if (visible && !document.hidden && !document.querySelector('dialog[open]') && wantsPlayback) {
      video.muted = true;
      video.play().then(syncToggle).catch(syncToggle);
    } else { video.pause(); syncToggle(); }
  }
  toggle.addEventListener('click', () => { playbackChoice = video.paused; refreshPlayback(); });
  for (const name of ['play', 'pause', 'loadedmetadata']) video.addEventListener(name, syncToggle);
  video.addEventListener('error', () => { toggle.disabled = true; toggle.textContent = 'Meeting preview unavailable'; });
  motion.addEventListener('change', () => { playbackChoice = null; refreshPlayback(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishDrag(); refreshPlayback(); });
  addEventListener('pagehide', () => { finishDrag(); video.pause(); });
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      refreshPlayback();
    }, { threshold: .06 }).observe(stage);
  } else { visible = true; refreshPlayback(); }
  return refreshPlayback;
}
