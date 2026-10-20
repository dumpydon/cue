// A short discoverability cue; the visitor's own position always takes priority.
export function setupComparisonDemo(slider) {
  const comparison = slider.closest('.comparison');
  if (!comparison) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const min = Number(slider.min) || 0, max = Number(slider.max) || 100;
  const origin = Math.max(min, Math.min(max, Number(slider.defaultValue)));
  const distance = (max - min) * .15;
  const left = Math.max(min, origin - distance), right = Math.min(max, origin + distance);
  const stops = [[0, origin], [250, origin], [900, left], [1080, left], [2280, right], [2460, right], [3100, origin]];
  let frame = 0, eligible = false, armed = true, interacted = false;

  function position(value) {
    slider.value = String(value);
    comparison.style.setProperty('--split', value + '%');
    slider.setAttribute('aria-valuetext', Math.round(value) + ' percent local view');
  }
  function stop(restore = false) {
    cancelAnimationFrame(frame); frame = 0;
    if (restore && !interacted) position(origin);
    comparison.dataset.comparisonDemo = interacted ? 'interactive' : motion.matches ? 'reduced-motion' : 'idle';
  }
  function play() {
    if (!eligible || !armed || interacted || motion.matches || document.hidden || document.activeElement === slider) return;
    armed = false;
    let start;
    function tick(now) {
      start ??= now;
      const elapsed = now - start;
      const stage = elapsed < 250 ? 'ready' : elapsed < 900 ? 'moving-left' : elapsed < 1080 ? 'left-edge' : elapsed < 2280 ? 'moving-right' : elapsed < 2460 ? 'right-edge' : 'returning';
      comparison.dataset.comparisonDemo = stage;
      for (let i = 1; i < stops.length; i++) {
        if (elapsed > stops[i][0]) continue;
        const [fromTime, from] = stops[i - 1], [toTime, to] = stops[i];
        const progress = Math.max(0, Math.min(1, (elapsed - fromTime) / (toTime - fromTime)));
        position(from + (to - from) * progress * progress * (3 - 2 * progress));
        break;
      }
      if (elapsed < stops.at(-1)[0]) frame = requestAnimationFrame(tick);
      else { frame = 0; position(origin); comparison.dataset.comparisonDemo = 'complete'; }
    }
    frame = requestAnimationFrame(tick);
  }
  function interact() {
    interacted = true; stop();
    // Keep the actual range value and the visible divider aligned on handover.
    position(Number(slider.value));
  }
  slider.addEventListener('pointerdown', interact, { capture: true });
  slider.addEventListener('keydown', interact, { capture: true });
  slider.addEventListener('focus', interact);
  slider.addEventListener('input', interact);
  motion.addEventListener('change', () => {
    stop(true); armed = true;
    if (!motion.matches) play();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(true); armed = true; }
    else play();
  });
  addEventListener('pagehide', () => { stop(true); armed = true; });
  addEventListener('pageshow', play);
  position(Number(slider.value));
  if (motion.matches) comparison.dataset.comparisonDemo = 'reduced-motion';
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(entries => {
      const entry = entries[0];
      if (!entry.isIntersecting || entry.intersectionRatio <= .05) {
        eligible = false; armed = true; stop(true); return;
      }
      eligible = entry.intersectionRatio >= .6;
      play();
    }, { threshold: [0, .05, .6, 1], rootMargin: '-90px 0px -10% 0px' }).observe(comparison);
  }
}
