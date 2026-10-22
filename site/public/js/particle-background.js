// Keep the reference's geometry and motion. This adapter only supplies Cue's page layout.
export function setupParticleBackground() {
  const layer = document.querySelector('[data-site-particles]');
  const canvas = layer?.querySelector('canvas');
  const hero = document.querySelector('[data-particle-hero]');
  if (!layer || !canvas || !hero) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let scene, sceneName = '', disposed = false, measureFrame = 0, freezeFrame = 0;
  let measured = [];
  const rules = [
    ['.site-nav>.wrap', 1, true],
    ['.hero h1', .38],
    ['.hero>.wrap>.sub', .78],
    ['.hero>.wrap>.ctas', .9],
    ['.hero>.wrap>.ctanote,.first-open-link', .85],
    ['#product-demo,.launch-video-shell,.native-panel,.privacy-demo,.launch-player-shell', 1],
    ['.desktop-demo-bar,.demo-tabs,.compatible-tools,.media-note', .9],
    ['.copy2,.spine>.wrap,.center,.stories-head,.dl>.wrap', .9],
    ['.tour-feature>.film-section-title,.tour-feature>.lead', .86],
    ['.faq', .9],
    ['.story-wall', .84],
    ['.cue-pricing-head,.cue-plan-switch-row,.cue-pricing-note', .9],
    ['.cue-member', .94],
  ];

  function measure() {
    const scrollY = window.scrollY;
    measured = rules.flatMap(([selector, strength, pinned = false]) =>
      [...document.querySelectorAll(selector)].flatMap(element => {
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return [];
        return [{ element: pinned ? element : null, x: rect.left, y: rect.top + scrollY,
          w: rect.width, h: rect.height, s: strength }];
      }));
  }

  function layout() {
    const scrollY = window.scrollY;
    const extent = layer.getBoundingClientRect();
    const rect = hero.getBoundingClientRect();
    return {
      scrollY,
      viewportW: layer.clientWidth,
      viewportH: window.innerHeight,
      docH: document.documentElement.scrollHeight,
      originY: extent.top + scrollY,
      layerBottom: extent.bottom + scrollY,
      hero: { x: rect.left, y: rect.top + scrollY, w: rect.width, h: rect.height, r: 0 },
      avoid: measured.map(({ element, ...box }) => {
        if (!element) return box;
        const current = element.getBoundingClientRect();
        return { ...box, x: current.left, y: current.top + scrollY, w: current.width, h: current.height };
      }),
    };
  }

  function freeze() {
    cancelAnimationFrame(freezeFrame);
    if (motion.matches && sceneName === 'dunes') {
      // Freeze after the first dune frame is painted, never during the hidden setup scene.
      freezeFrame = requestAnimationFrame(() => scene?.stop());
    }
  }

  function resize() {
    if (disposed || measureFrame) return;
    measureFrame = requestAnimationFrame(() => {
      measureFrame = 0;
      measure();
      scene?.resize();
      if (motion.matches && sceneName !== 'dunes') scene?.start();
      freeze();
    });
  }

  function preferenceChanged() {
    if (motion.matches) freeze();
    else scene?.start();
  }

  function contentSettled(event) {
    // Feature sections move slightly while they reveal; align their quiet zones afterwards.
    if (event.target.matches('.io')) resize();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(document.body);
  observer.observe(hero);
  document.fonts.addEventListener('loadingdone', resize);
  window.addEventListener('resize', resize);
  document.addEventListener('toggle', resize, true);
  document.addEventListener('transitionend', contentSettled, true);
  motion.addEventListener('change', preferenceChanged);

  function dispose() {
    disposed = true;
    scene?.destroy();
    observer.disconnect();
    cancelAnimationFrame(measureFrame);
    cancelAnimationFrame(freezeFrame);
    document.fonts.removeEventListener('loadingdone', resize);
    window.removeEventListener('resize', resize);
    document.removeEventListener('toggle', resize, true);
    document.removeEventListener('transitionend', contentSettled, true);
    motion.removeEventListener('change', preferenceChanged);
  }
  window.addEventListener('pagehide', event => event.persisted ? scene?.stop() : dispose());
  window.addEventListener('pageshow', event => {
    if (event.persisted && !disposed) { resize(); if (!motion.matches) scene?.start(); }
  });

  // Let the existing content paint before compiling the reference's shaders.
  requestAnimationFrame(() => requestAnimationFrame(async () => {
    if (disposed) return;
    try {
      const { createGrainScene } = await import('./vendor/raisedhand-grain-engine.js');
      if (disposed) return;
      measure();
      scene = createGrainScene(canvas, {
        mode: 'page', pageLayout: layout, intro: false, dunesOnly: true,
        transparent: true,
        // Build the original dunes offscreen, then freeze them for reduced motion.
        reducedMotion: false,
        onScene(name) {
          sceneName = name;
          layer.dataset.ready = String(name === 'dunes');
          layer.dataset.scene = name;
          freeze();
        },
      });
      scene.start();
    } catch (error) {
      // Decorative failure leaves Cue's original page and background fully usable.
      dispose();
      console.warn('Cue particle background unavailable:', error);
    }
  }));
}
