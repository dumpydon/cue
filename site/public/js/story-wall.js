// Illustrative stories, not testimonials. Keep each original card accessible once.
export function setupStoryWall() {
  const section = document.querySelector('#stories');
  if (!section) return;
  const wall = section.querySelector('.story-wall');
  const toggle = section.querySelector('.stories-toggle');
  const label = toggle.querySelector('span');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches;
  let visible = false;

  section.querySelectorAll('.story-group').forEach(group => {
    const copy = group.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    group.after(copy);
  });
  wall.classList.add('is-ready');
  toggle.hidden = false;

  function sync() {
    wall.dataset.running = String(!paused && !motion.matches && visible && !document.hidden);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.disabled = motion.matches;
    label.textContent = motion.matches ? 'Motion off' : paused ? 'Resume motion' : 'Pause motion';
  }

  toggle.addEventListener('click', () => { paused = !paused; sync(); });
  wall.addEventListener('pointerdown', () => { paused = true; sync(); });
  wall.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      paused = true;
      sync();
    }
  });
  motion.addEventListener('change', () => { paused = motion.matches; sync(); });
  document.addEventListener('visibilitychange', sync);
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: .05 });
    observer.observe(wall);
  } else visible = true;
  sync();
}
