/* Adapted from Raised Hand's public SandText pricing component, retrieved 2026-10-22.
 * Source: https://raisedhand.ai/_next/static/chunks/0jjaj9zpfgcln.js
 * Original point sampling, seeded drift, easing and 910 ms timing are retained.
 * The React lifecycle is replaced with a small DOM controller for Cue.
 */
const ease = value => 1 - (1 - value) ** 3;
const clamp = value => Math.min(1, Math.max(0, value));
const noise = (index, seed) => {
  const value = 43758.5453 * Math.sin(12.9898 * index + 78.233 * seed);
  return value - Math.floor(value);
};

function sampleText(text, style, scale) {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return { points: [], width: 0 };
  measure.font = style.font;
  if ('letterSpacing' in measure) measure.letterSpacing = style.spacing;
  const metrics = measure.measureText(text);
  const width = Math.ceil(metrics.width);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || 32);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || 8);
  const pixelWidth = Math.max(1, Math.ceil((width + 4) * scale));
  const pixelHeight = Math.max(1, Math.ceil((ascent + descent + 4) * scale));
  const buffer = document.createElement('canvas');
  buffer.width = pixelWidth;
  buffer.height = pixelHeight;
  const context = buffer.getContext('2d', { willReadFrequently: true });
  if (!context) return { points: [], width };
  context.scale(scale, scale);
  context.font = style.font;
  if ('letterSpacing' in context) context.letterSpacing = style.spacing;
  context.fillStyle = '#000';
  context.textBaseline = 'alphabetic';
  context.fillText(text, 1, ascent + 2);
  if (style.strike) context.fillRect(0, ascent + 2 - .36 * ascent - .75, width + 2, 1.5);
  const pixels = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
  const step = Math.max(1, Math.round(1.6 * scale));
  const points = [];
  for (let y = 0; y < pixelHeight; y += step) {
    for (let x = 0; x < pixelWidth; x += step) {
      if (pixels[(y * pixelWidth + x) * 4 + 3] > 110) points.push([x / scale - 1, y / scale - (ascent + 2)]);
    }
  }
  return { points, width };
}

export function createSandText(element, motion = matchMedia('(prefers-reduced-motion: reduce)')) {
  let current = element.textContent.trim(), frame = 0;
  const words = document.createElement('span');
  words.className = 'cue-sand-words';
  words.textContent = current;
  const baseline = document.createElement('i');
  baseline.className = 'cue-sand-base';
  baseline.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  canvas.className = 'cue-sand-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  element.classList.add('cue-sand');
  element.replaceChildren(words, baseline, canvas);

  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    delete words.dataset.moving;
    canvas.style.opacity = '0';
    element.dataset.animating = 'false';
  }
  const preferenceChanged = () => { if (motion.matches) finish(); };
  motion.addEventListener('change', preferenceChanged);

  return {
    set(next) {
      if (next === current) return;
      const previous = current;
      current = next;
      finish();
      words.textContent = next;
      if (motion.matches || document.hidden) return;
      const computed = getComputedStyle(words);
      const style = {
        font: `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`,
        spacing: computed.letterSpacing === 'normal' ? '0px' : computed.letterSpacing,
        colour: computed.color,
        strike: element.tagName === 'S',
      };
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const from = sampleText(previous, style, scale);
      const to = sampleText(next, style, scale);
      const context = canvas.getContext('2d');
      if (!context || (!from.points.length && !to.points.length)) return;
      const width = Math.max(from.width, to.width) + 192;
      const height = element.offsetHeight + 72;
      const yOrigin = 36 + baseline.offsetTop;
      const accent = getComputedStyle(element).getPropertyValue('--sand-accent').trim() || '#9dbcff';
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      Object.assign(canvas.style, { width: `${width}px`, height: `${height}px`, left: '-96px', top: '-36px', opacity: '1' });
      const leaving = from.points.map(([x, y], index) => ({
        sx: x, sy: y,
        delay: (1 - x / Math.max(1, from.width)) * 196 + 90 * noise(index, 1),
        drift: noise(index, 2), shade: noise(index, 3),
      }));
      const arriving = to.points.map(([x, y], index) => ({
        tx: x, ty: y, sx: x + 40 + 70 * noise(index, 4), sy: y + (noise(index, 5) - .5) * 34,
        delay: 170 + x / Math.max(1, to.width) * 186 + 80 * noise(index, 6),
        drift: noise(index, 7), shade: noise(index, 8),
      }));
      words.dataset.moving = '';
      element.dataset.animating = 'true';
      const started = performance.now();
      function draw(now) {
        const elapsed = now - started;
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.clearRect(0, 0, width, height);
        for (const point of leaving) {
          const progress = clamp((elapsed - point.delay) / 392);
          if (progress >= 1) continue;
          const wind = progress * progress;
          const x = point.sx - wind * (70 + 90 * point.drift);
          const y = point.sy - wind * (14 + 26 * point.drift) + 3 * Math.sin((progress + point.drift) * 6) * progress;
          context.globalAlpha = (1 - progress) * (point.shade < .12 ? .9 : 1);
          context.fillStyle = point.shade < .12 ? accent : style.colour;
          context.fillRect(96 + x, yOrigin + y, 1.25, 1.25);
        }
        for (const point of arriving) {
          const progress = clamp((elapsed - point.delay) / 384.4);
          if (progress <= 0) continue;
          const settle = ease(progress);
          const x = point.sx + (point.tx - point.sx) * settle;
          const y = point.sy + (point.ty - point.sy) * settle + 3 * Math.sin((1 - progress) * 5 + 6 * point.drift) * (1 - settle);
          context.globalAlpha = Math.min(1, 1.6 * progress) * (point.shade < .12 && progress < .9 ? .9 : 1);
          context.fillStyle = point.shade < .12 && progress < .9 ? accent : style.colour;
          context.fillRect(96 + x, yOrigin + y, 1.25, 1.25);
        }
        context.globalAlpha = 1;
        if (elapsed < 910) frame = requestAnimationFrame(draw);
        else finish();
      }
      frame = requestAnimationFrame(draw);
    },
    destroy() { finish(); motion.removeEventListener('change', preferenceChanged); },
  };
}
