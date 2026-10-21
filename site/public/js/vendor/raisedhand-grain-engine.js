/* Adapted from https://raisedhand.ai/landing/grain-engine.js (retrieved 2026-10-21).
 * Original SHA256: 1028d1c1ac5ecb3aaf732a3fb6f56786a76f027128c4aba9cd9075f0b0099d67
 * Cue changes: optional transparent compositing and a same-origin module worker.
 * Dune geometry, camera, random seeds, particle shaders, spiral paths and timing are unchanged.
 * See site/PARTICLE_BACKGROUND.md for provenance and integration details.
 */
/* ==========================================================================
 *  Raised Hand hero: grain engine (v5, the loop)
 *  A plain ES module with no dependencies. Load it with a native import:
 *
 *    const { createGrainScene } = await import('/grain-engine.js');
 *    const scene = createGrainScene(canvas, {
 *      mode: 'card',                   // 'card' (default): the canvas IS the hero card, as in v2.
 *                                      // 'page': one canvas fixed to the viewport behind the whole
 *                                      // page; see "Page mode" below
 *      pageLayout: () => ({...}),      // page mode only, called once per frame (see below)
 *      intro: true,                    // play the ~3.3 s logo intro before the hero
 *      reducedMotion: false,           // true: one still frame, no intro, no animation loop
 *      handImageUrl: '/hand-glass.png',// the white glass hand (alpha is sampled for the mark)
 *      wordmark: 'RaisedHand',         // drawn in Inter 600; a trailing "Hand" is mint
 *      font: 'Inter, sans-serif',
 *      avoidRects: () => [{ x, y, w, h, s }],  // CSS px relative to the canvas; grains are dimmed
 *                                      // behind them (s = strength 0..1, default 0.84)
 *      onPhase: (name) => {},          // 'swirl' | 'logo' | 'gust' | 'settled'
 *      onFirstFrame: () => {},         // after the first frame is on screen (fade the canvas in here)
 *      loop: true,                     // v5: after the intro, loop silk -> hand -> dunes -> silk ...
 *                                      // (false: stay on the silk, as v3)
 *      onScene: (name) => {},          // v5: 'silk' | 'hand' | 'dunes', as each scene settles
 *    });
 *    scene.start();                    // begins once assets are ready (safe to call immediately)
 *    scene.stop();                     // pause the loop (state is kept)
 *    scene.skipIntro();                // hurry to the settle: a quick gust, no cut
 *    scene.resize();                   // call when the canvas's CSS size changes (e.g. ResizeObserver)
 *    scene.destroy();                  // stop, drop listeners, free GPU memory
 *    scene.ready;                      // true once grains (and the mark) are built
 *
 *  In card mode the canvas is sized by CSS: the engine reads clientWidth/clientHeight and
 *  devicePixelRatio. It pauses itself while document.hidden. Without WebGL2 it draws one still
 *  frame with Canvas 2D.
 *
 *  Page mode. The canvas is part of the document, behind the page's content: it sits in a layer
 *  that is position: absolute, inset 0, overflow hidden, z-index -1, as the first child of the page
 *  (an isolated stacking context), and the canvas itself is position: absolute, top 0, left 0,
 *  width 100%. The engine sets the canvas's height (the viewport's plus an overscan of 128 CSS px
 *  above and below, 160 on touch screens) and moves it with a transform so it stays on the
 *  viewport. It is not position: fixed on purpose: the browser scrolls the page on its compositor,
 *  ahead of the frame being drawn, and a fixed canvas then lags the text by a frame; a canvas in
 *  the document scrolls with the text, and the overscan covers the scroll that has not been drawn.
 *  It paints the page colour, the hero card (its colour, glow, rounded top corners and the bottom
 *  edge melting into the page), the hero's ribbons inside the card, and a stream of sand that blows
 *  off the ribbons' left end, turns, falls out of the card and spirals down the whole page.
 *  Everything lives in document coordinates. pageLayout() is called in each frame that draws and
 *  returns, in CSS px:
 *      { scrollY,                      // window.scrollY, read live
 *        viewportW, viewportH,         // the layer's width, the window's inner height
 *        docH,                         // document height
 *        originY, layerBottom,         // the layer's top and bottom in document coordinates (read
 *                                      // originY live if anything above the page can change height)
 *        hero: { x, y, w, h, r },      // the hero card in document coordinates, read live;
 *                                      // r = its corner radius
 *        avoid: [{ x, y, w, h, s }] }  // content blocks in document coordinates. Grains are dimmed
 *                                      // behind them (s = strength 0..1, default 0.84)
 *  Rects inside the hero card work like avoidRects (the copy and nav); the rest quieten the stream
 *  behind text that sits straight on the page, see-through panels and other canvases, so it shows
 *  in gutters, between sections and softly through glass. The stream is dimmed linearly: behind a
 *  rect of strength s it keeps 1 - s of its light (0.9 leaves a tenth), and a rect with no s keeps
 *  it out altogether (the card's copy and nav, which its lead-in passes behind on a phone). Up to
 *  24 rects near the viewport are used at once. Measure them on resize and when the
 *  layout changes (place blocks inside sticky containers live). Call resize() in the same frame as
 *  a change of the viewport or the document's height (a ResizeObserver callback is right). A small
 *  height-only change (a phone's toolbar) moves neither the canvas's size nor the stream's path.
 *  In page mode avoidRects is not used. The intro plays in the card as in card mode. With the card
 *  off screen the engine draws at most ~60 frames a second and skips the bloom. Reduced motion
 *  draws a still that is redrawn on scroll. Without WebGL2 the card's still is drawn and moved
 *  with the scroll; there is no stream.
 *
 *  The loop (v5). After the intro (at once when intro is false) the hero runs a loop over the same
 *  grains: the silk (10 s), a change (3.9 s), the hand (10 s), a change (3.5 s), the dunes (10 s), a
 *  change (3.5 s), the silk again, and round forever. In a change a quick gust front sweeps in from
 *  the right: it lifts each grain from its place in the one scene, the wind carries it left along its
 *  lane, and it settles into its place in the next (the same grains; never a cut, a cross-fade or a
 *  grain fading where it stands). Sand whose new place is upwind goes round: off the card's downwind
 *  edge and back in on the gust from upwind. Every scene blows sand off its left side in the silk's
 *  laminar style, and in page mode the stream down the page starts where that scene's blown sand
 *  leaves it and runs on through every scene and change. The hand and the dunes are laid out once per
 *  card size, after the intro, in a worker; until they are ready the silk simply holds. Reduced motion
 *  and the 2D fallback show one still of the silk, as before.
 *
 *  How it works. Every grain is a pure function of time (no simulation state):
 *   - the hero is a 3D silk sheet S(u,v,t) (Bezier spine, twist, folds); a grain lives at fixed
 *     (u,v) and is lit on the GPU (diffuse, specular, bloom, filmic tone map, film grain);
 *   - the sheet's left end frays: how readily a grain leaves depends on how far along the ribbon
 *     it sits and how near an edge. A grain that leaves spends a share of each cycle on the silk
 *     and the rest riding a steady wind up and to the left, with only a faint, slow ripple in it,
 *     so the sand streams off laminar and combed along the ribbon (no curls, loops or drips).
 *     Neighbours share their timing, so patches lift together and the spray pulses in soft waves;
 *   - the intro reuses the same grains: silky swirl -> the mark gathers -> a gust peels it off to
 *     the left, hand first -> the grains settle onto the sheet along the ribbons, whose clock has
 *     been running all along;
 *   - page mode's stream is a band of grains on a path: a lead-in that starts inside the ribbon's
 *     frayed left end, runs left with the wind, turns down the card's left margin and falls out of
 *     the card, then a helix round a slowly wandering vertical axis, seen from above at a slant, so
 *     on a desktop each turn is a loop of a coil (a bright, wide front sweep and a dim, narrow back
 *     sweep) and on a phone a softer wave. Every grain keeps its place across the band and advances
 *     along the path at one speed, spaced evenly by length, so the band stays laminar: fine combed
 *     lanes running its length. Grains need no buffer (each comes from its vertex id) and each
 *     frame draws only the run of ids near the viewport.
 * ========================================================================== */

const HAND_PATH = 'M 34 88 L 34 72 C 32 66 25 61 21.5 56 Q 18.5 51 23 48.5 Q 28 46 31 51.5 C 32.5 54.5 33.5 57 34 59 L 34 30.5 A 4.5 4.5 0 0 1 43 30.5 L 43 48 L 46 48 L 46 24.5 A 4.5 4.5 0 0 1 55 24.5 L 55 48 L 58 48 L 58 28.5 A 4.5 4.5 0 0 1 67 28.5 L 67 48 L 70 48 L 70 38 A 4 4 0 0 1 78 38 L 78 72 C 78 82 70 88 62 88 Z';

/* intro timeline, seconds of intro clock */
const TL = { land: 1.12, tg: 1.62, span: 1.64 };   // all landed / gust starts / gust start -> settled
const HERO_T0 = 12.4;      // the sheet's clock at the start of the intro (a gust is under way)
const STILL_T = 23.0;      // reduced motion: the one frame
const LOOK = { gain: 1.35, exposure: 1.0, bloom: 0.45, film: 0.026, wind: [-0.12, -0.072], turb: 0.028 };
const MAX_RECTS = 6;
const MAX_QRECTS = 24;       // page mode: content blocks near the viewport that quieten the stream (keep it at 24 or more)
const PAGE_BG = [4, 6, 10];  // #04060a, the page
/* page mode's stream. dens: grains per px of path; the path is measured along its length, so the
   band is equally dense in its sweeps and at its sides. back: the far side of each turn, its light
   and width. quiet: the feather (px) round the page's text blocks; leadQuiet: the same in the card,
   along the lead-in (a desktop's runs beside the copy, a phone's behind it). */
const STREAM = {
  desk: { dens: 20, gain: 2.4, hw: 64, backL: 0.5, backW: 0.6, quiet: 30, leadQuiet: 3, speed: 90, R: 0.34, sway: 0.08, pitch: 1.0, loop: 2.0 },
  phone: { dens: 15, gain: 2.6, hw: 48, backL: 0.55, backW: 0.66, quiet: 14, leadQuiet: 24, speed: 70, R: 0.40, sway: 0.04, pitch: 0.9, loop: 0.35 },
};
const LEAD_N = 32;           // points along the stream's lead-in (equal steps of length)
const WARP_N = 48;           // steps in the table that spaces grains evenly round each turn
const OVERSCAN = { fine: 128, coarse: 160 };   // page mode: CSS px drawn above and below the viewport
const TAU_JS = Math.PI * 2;
const PAGE_LIN = PAGE_BG.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });

/* ------------------------------------------------------------------ small math */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sstep(e0, e1, x) { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

/* ------------------------------------------------------------------ the silk
 * Scene units: y in [0,1] top to bottom, x in [0, aspect]. */
function silkLayers(A) {
  const X = (f) => f * A;
  if (A >= 0.95) {
    return [
      { // main sash: in from the top right, a long belly left of the copy, its tail lifting into the wind
        P: [[X(1.18), 0.04], [X(0.50), 0.00], [X(0.30), 1.12], [X(-0.16), 0.30]],
        W: [0.190, 0.40, 0.66, 0.30], T: [0.20, 0.42, 1.1, 0.5], M: [1.20, 0.30, 0.012, 0.0], E: [0.70, 0.30],
        share: 0.68, fray: [0.56, 0.95],
      },
      { // a narrower ribbon nested above it, flowing the same way
        P: [[X(1.14), -0.04], [X(0.52), -0.06], [X(0.36), 0.80], [X(-0.08), 0.14]],
        W: [0.078, 0.50, 0.50, 0.34], T: [0.12, 0.70, 1.6, 2.0], M: [0.75, 0.28, 0.010, 1.7], E: [0.66, 0.40],
        share: 0.32, fray: [0.52, 0.92],
      },
    ];
  }
  return [
    {
      P: [[X(1.34), 0.09], [X(0.40), 0.02], [X(0.62), 0.60], [X(-0.36), 0.20]],
      W: [0.096, 0.42, 0.62, 0.30], T: [0.20, 0.42, 1.1, 0.5], M: [1.20, 0.30, 0.007, 0.0], E: [0.70, 0.30],
      share: 0.70, fray: [0.52, 0.94],
    },
    {
      P: [[X(1.28), 0.03], [X(0.42), -0.03], [X(0.60), 0.42], [X(-0.30), 0.10]],
      W: [0.040, 0.50, 0.50, 0.34], T: [0.12, 0.50, 1.6, 2.0], M: [0.75, 0.28, 0.006, 1.7], E: [0.66, 0.40],
      share: 0.30, fray: [0.48, 0.92],
    },
  ];
}
function bezJS(P, u) { const m = 1 - u, a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u; return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]]; }
function bezDJS(P, u) { const m = 1 - u, a = 3 * m * m, b = 6 * m * u, c = 3 * u * u; return [a * (P[1][0] - P[0][0]) + b * (P[2][0] - P[1][0]) + c * (P[3][0] - P[2][0]), a * (P[1][1] - P[0][1]) + b * (P[2][1] - P[1][1]) + c * (P[3][1] - P[2][1])]; }
function widthAt(W, u) { const z = (u - W[2]) / W[3]; return W[0] * (W[1] + (1 - W[1]) * Math.exp(-z * z)); }
// how readily a grain leaves on the wind: the ribbon's left end and its edges go first, with a
// ragged front (a few fine lanes across the ribbon run a little ahead of the rest)
function frayOf(Ly, u, v) {
  const av = Math.abs(v);
  return sstep(Ly.fray[0], Ly.fray[1], u + 0.11 * sstep(0.45, 1, av) + 0.035 * Math.sin(9 * v + 1.3) + 0.06 * Math.sin(19 * v + 0.7) + 0.035 * Math.sin(43 * v + 2.1));
}

// the silk's sheet on the CPU (mirrors surf() in the shaders)
function surfJS(Ly, u, v, t) {
  const TAU = Math.PI * 2, d = bezDJS(Ly.P, u), l = Math.hypot(d[0], d[1]) || 1, tx = d[0] / l, ty = d[1] / l, nx = -ty, ny = tx;
  const b = bezJS(Ly.P, u), bo = Ly.M[2] * Math.sin(TAU * 1.1 * u - 0.35 * t + Ly.M[3]);
  const cz = Ly.M[2] * 3 * Math.sin(TAU * 0.9 * u - 0.27 * t + 1 + Ly.M[3]);
  const th = Ly.T[0] + Ly.T[1] * Math.sin(TAU * Ly.T[2] * u + Ly.T[3] - 0.11 * t);
  const Bx = nx * Math.cos(th), By = ny * Math.cos(th), Bz = Math.sin(th);
  const Nx = ty * Bz, Ny = -tx * Bz, Nz = tx * By - ty * Bx, w = widthAt(Ly.W, u);
  const r = Ly.M[1] * w * (0.55 * Math.sin(3.14159 * 1.1 * v + TAU * 0.8 * u - 0.30 * t + Ly.M[3])
    + 0.26 * Math.sin(3.14159 * 2.3 * v + TAU * 1.5 * u + 1.0 - 0.42 * t)
    + 0.10 * Math.sin(3.14159 * 4.7 * v + TAU * 2.4 * u + 2.0 - 0.55 * t));
  return [b[0] + nx * bo + Bx * v * w + Nx * r, b[1] + ny * bo + By * v * w + Ny * r, cz + Bz * v * w + Nz * r];
}

function shuffle4(G, n, rand) {
  for (let a = n - 1; a > 0; a--) {
    const b = (rand() * (a + 1)) | 0;
    for (let c = 0; c < 4; c++) { const s = G[4 * a + c]; G[4 * a + c] = G[4 * b + c]; G[4 * b + c] = s; }
  }
}

function buildGrains(A, maxN, seed) {
  const layers = silkLayers(A);
  const rand = mulberry32(seed);
  const shareSum = layers.reduce((s, l) => s + l.share, 0);
  const nSheet = maxN;
  const g = new Float32Array(nSheet * 4), fly = new Uint8Array(nSheet);
  let k = 0, nFly = 0;
  layers.forEach((Ly, li) => {
    const n = li === layers.length - 1 ? nSheet - k : Math.round(nSheet * Ly.share / shareSum);
    const K = 2048, cdf = new Float64Array(K + 1);
    let acc = 0, len = 0;
    for (let i = 0; i < K; i++) {
      const u = (i + 0.5) / K, d = bezDJS(Ly.P, u), sp = Math.hypot(d[0], d[1]);
      acc += widthAt(Ly.W, u) * sp / K; len += sp / K; cdf[i + 1] = acc;
    }
    // stratified (jittered-grid) sampling over the sheet's area: even, never clumpy
    const nv = Math.max(4, Math.round(Math.sqrt(n * 2 * (acc / len) / len)));
    const nu = Math.ceil(n / nv);
    let m = 0;
    for (let i = 0; i < nu && m < n; i++) {
      for (let j = 0; j < nv && m < n; j++, m++) {
        const U = (i + rand()) / nu * acc;
        let lo = 0, hi = K;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf[mid] < U) lo = mid; else hi = mid; }
        const u = (lo + (U - cdf[lo]) / Math.max(1e-12, cdf[lo + 1] - cdf[lo])) / K;
        const v = -1 + 2 * (j + rand()) / nv;
        let e = frayOf(Ly, u, v);
        if (e < 0.02 && rand() < 0.004) e = 0.07; // now and then a grain lifts from anywhere
        const o = 4 * (k + m);
        g[o] = u; g[o + 1] = v; g[o + 2] = li; g[o + 3] = e;
        if (e > 0.015) { fly[k + m] = 1; nFly++; }
      }
    }
    k += n;
  });
  const split = (want) => {
    const n = want ? nFly : nSheet - nFly;
    const G = new Float32Array(n * 4);
    let m = 0;
    for (let i = 0; i < nSheet; i++) if (!!fly[i] === want) { G.set(g.subarray(4 * i, 4 * i + 4), 4 * m); m++; }
    shuffle4(G, n, rand); // any prefix is an even subsample (adaptive count)
    return { g: G, n };
  };
  return { anch: split(false), fly: split(true), layers };
}

function layerUniforms(layers, A) {
  const P = new Float32Array(24), W = new Float32Array(12), T = new Float32Array(12), M = new Float32Array(12), E = new Float32Array(12);
  layers.forEach((L, i) => {
    L.P.forEach((p, j) => { P[(i * 4 + j) * 2] = p[0]; P[(i * 4 + j) * 2 + 1] = p[1]; });
    W.set(L.W, i * 4); T.set(L.T, i * 4); M.set(L.M, i * 4); E.set([L.E[0], L.E[1], 0, 0], i * 4);
  });
  const pool = A >= 0.95 ? [0.30 * A, 0.50, 0.80, 0.52] : [0.42 * A, 0.28, 0.46, 0.22];
  return { P, W, T, M, E, pool };
}

/* ==================================================================== the dunes (v4)
 * The loop's third scene: rolling dunes made of the same fine grain. A dune field (a heightfield of
 * transverse dunes, bigger on the left and small and far away on the right, under the copy) is
 * raymarched once on the GPU into a small lit image: light, tint, how near a crest, and distance.
 * That image is read back and grains are stippled from it (dense where the light is, sparse in
 * shadow), so the picture itself is made of grains, and each grain carries its light with it.
 * The light is low, from the left and a little behind the dunes, so the crests and slip faces turn
 * to it and catch a soft mint and white, and the windward backs and troughs fall into deep sapphire.
 * Some grains on the crests are blowers: the wind takes them off to the left, as the silk's
 * blow-off does. The composite paints the dunes' bodies from the same image, so they are solid.
 * Changing the composition: DUNE_TUNE (camera, sun, field) per shape of card. */
const DUNE_LMAX = 2.0;       // the bake's light range (square-root encoded in 8 bits)
const DUNE_BLOW = 0.32;      // blowers, as a share of the grains (most of their time is spent at rest)
const DUNE_WIND = [-0.16, -0.045];   // the crest wind, scene units per second (left, a touch up)
const DUNE_GAIN = 0.95;      // the dunes' brightness against the silk's
const DUNE_BAKE_SCALE = 0.85; // the lit image's pixels per CSS px (coarser shows steps along the bright skylines)
// Composition. k: 0 a portrait phone .. 1 a wide desktop card (see duneCamera)
const DUNE_TUNE = {
  camH: 9, sunAz: -68, sunEl: 5, amp: 3.6, lam: 30, bigBoost: 1.35, fog: 0.011,
  sideC: -0.16, sideW: 0.38, sideMin: 0,
  vfov: [44, 30],            // vertical field of view, degrees: phone, desktop
  horizon: [0.74, 0.60],     // where the horizon sits, measured up from the card's bottom: phone, desktop
  yaw: [-0.07, 0.0],
};
function duneCamera(A) {
  const T = DUNE_TUNE, DEG = Math.PI / 180, k = sstep(0.46, 1.25, A), lerp = (v) => v[0] + (v[1] - v[0]) * k;
  const vfov = lerp(T.vfov) * DEG, h0 = lerp(T.horizon), tanHalf = Math.tan(vfov / 2);
  const pitch = Math.atan((0.5 - h0) * 2 * tanHalf), yaw = lerp(T.yaw);
  const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  const az = T.sunAz * DEG + yaw * 0.5, el = T.sunEl * DEG;
  const sun = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  return { A, k, tanHalf, rot: [...r, ...u, ...f], pos: [0, T.camH, 0], sun, horizon: 1 - h0 };
}
// the sky behind the dunes: the card's pool of light sits up and to the left of them, and a soft
// glow lies low on the horizon where the light comes from
function DUNE_SKY(A, cam) {
  const k = cam.k;
  return {
    glow: [(0.14 + 0.10 * (1 - k)) * A, cam.horizon - 0.10, 0.55 + 0.10 * k],
    hglow: [(0.10 - 0.04 * k) * A, cam.horizon, 0.55 * Math.max(A, 1.2), 1.0],
  };
}
/* Stipple grains from the baked image px (RGBA8, rows bottom up, bw x bh over the card): n grains on
   the dunes and about nB blowers, all shuffled, so any prefix is an even subsample (adaptive
   count) and any split of the first set is too (the intro gives the silk's two sets one stretch
   each). One pass over the pixels, no rejection: each pixel gets a share of the grains in step
   with its light (dense where the light is, sparse in shadow), carried from pixel to pixel so the
   counts come out exact. avgArea: CSS px^2 one grain covers on average, so the energy per grain
   makes the light per area match the bake, whatever the count, density or grain size.
   Returns st and bl, Float32Arrays of 8 per grain: x, y (scene units, y down), energy, tint,
   crest, nearness (1 near .. 0 far), random, and for blowers their share of time in the air. */
function stippleDunes(px, bw, bh, A, cssH, n, nB, avgArea, seed) {
  const rand = mulberry32(seed), N = bw * bh;
  // the bake's light is 8 bits, so its light and grain density come from two small tables
  const LUT = new Float32Array(256), DUT = new Float32Array(256);
  for (let v = 0; v < 256; v++) { const r = v / 255; LUT[v] = r * r * DUNE_LMAX; DUT[v] = Math.min(1, Math.pow(LUT[v] * 3.0, 0.72)); }
  // per column: the skyline (the dunes' top edge, where the wind takes sand first), how far left, and
  // the streamer fingers along the crests
  const sky = new Int32Array(bw).fill(-1), colL = new Float32Array(bw), colH = new Float32Array(bw);
  for (let x = 0; x < bw; x++) {
    for (let y = bh - 1; y >= 0; y--) if (px[(y * bw + x) * 4 + 3] >= 20) { sky[x] = y; break; }
    const X = (x + 0.5) / bw;
    colL[x] = Math.pow(1 - sstep(0.0, 0.55, X), 1.1);
    colH[x] = Math.pow(0.5 + 0.5 * Math.sin(X * 41 + 2.6 * Math.sin(X * 7.3) + 1.1), 3.0);
  }
  const skyW = 0.014 * bh, rimW = 0.004 * bh;
  const crestAt = (x, y, o, near) => { const dy = sky[x] - y, sp = dy < 8 * skyW ? Math.exp(-dy / skyW) : 0; return Math.min(1, Math.max(px[o + 2] / 255 * 1.4, sp * (0.2 + 0.8 * near))); };
  // per pixel: how many grains it wants (w) and the share the wind takes (pb)
  const w = new Float32Array(N), pb = new Float32Array(N);
  let W = 0, WB = 0, src = null;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x, o = 4 * i, a = px[o + 3];
      if (a < 20) continue;                                   // sky
      const D = DUT[px[o]];
      if (D <= 0) continue;
      const near = (a / 255 - 0.1) / 0.9, crestP = crestAt(x, y, o, near);
      const dy = sky[x] - y, sp = dy < 8 * skyW ? Math.exp(-dy / skyW) : 0;
      // spindrift off the brinks and the skyline, strong on the left, gone by the copy
      const p = Math.max(crestP * 0.5, sp) * crestP * (0.02 + 0.93 * colL[x]) * (0.3 + 0.7 * near) * (0.3 + 0.7 * colH[x]);
      w[i] = D; pb[i] = p; W += D; WB += D * p;
      const X = (x + 0.5) / bw;
      if (X > 0.02 && X < 0.35 && crestP > 0.5) {             // page mode's stream starts at the best of these
        const sc = 1 - (y + 0.5) / bh, score = crestP * (1 - 0.6 * X) * (1.2 - sc) * (0.5 + 0.5 * near);
        if (!src || score > src[2]) src = [X * A, sc, score];
      }
    }
  }
  if (W <= 0) W = 1;
  // grains per unit weight: every pixel keeps its full share of grains; the blowers are extra, on top of
  // the crests, so a crest never thins when its sand is in the air (it simply glows less)
  const k = n / W, kb = WB > 0 ? nB / WB : 0;
  const tmpS = new Float32Array(n * 8), tmpB = new Float32Array(Math.ceil(nB * 1.05 + 16) * 8);
  const pxArea = (A * cssH / bw) * (cssH / bh);             // CSS px^2 per bake pixel
  let ns = 0, nb = 0, cs = rand(), cb = rand();
  for (let y = 0; y < bh && ns < n; y++) {
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      if (!(w[i] > 0)) continue;
      cs += w[i] * k; cb += w[i] * pb[i] * kb;
      let ms = Math.floor(cs), mb = Math.floor(cb);
      cs -= ms; cb -= mb;
      if (ms + mb === 0) continue;
      const o = 4 * i, near = (px[o + 3] / 255 - 0.1) / 0.9, crestP = crestAt(x, y, o, near);
      // the skyline catches the low light from behind as a soft mint and white rim
      const dy = sky[x] - y, rim = dy < 8 * rimW ? Math.exp(-dy / rimW) * near : 0;
      const E = LUT[px[o]] * pxArea / (w[i] * k * avgArea) * (1 + 1.5 * rim);   // light per area matches the bake
      const tint = Math.min(1, px[o + 1] / 255 + 0.5 * rim);
      for (; ms > 0 && ns < n; ms--, ns++) {
        const q = ns * 8;
        tmpS[q] = (x + rand()) / bw * A; tmpS[q + 1] = 1 - (y + rand()) / bh; tmpS[q + 2] = E * (0.55 + 0.9 * rand()); tmpS[q + 3] = tint;
        tmpS[q + 4] = crestP; tmpS[q + 5] = near; tmpS[q + 6] = rand(); tmpS[q + 7] = 0;
      }
      for (; mb > 0 && nb * 8 < tmpB.length; mb--, nb++) {
        const q = nb * 8;
        tmpB[q] = (x + rand()) / bw * A; tmpB[q + 1] = 1 - (y + rand()) / bh; tmpB[q + 2] = E * 0.7 * (0.55 + 0.9 * rand()); tmpB[q + 3] = tint;
        tmpB[q + 4] = crestP; tmpB[q + 5] = near; tmpB[q + 6] = rand();
        tmpB[q + 7] = Math.min(0.8, 0.30 + 0.45 * colL[x]) * (0.85 + 0.3 * rand());   // share of each cycle in the air
      }
    }
  }
  // if the counts ran short (a nearly empty field), repeat grains so the silk still has somewhere to land
  for (let i = ns; i < n; i++) { const j = (i % Math.max(1, ns)) * 8; tmpS.copyWithin(i * 8, j, j + 8); }
  // reordered so any prefix, and any split, is an even subsample: grain i is taken from i times a
  // golden-ratio stride through the pixel order (a low-discrepancy walk, much cheaper than a shuffle)
  const shuffled = (G, m) => {
    const out = new Float32Array(m * 8);
    if (m < 2) { out.set(G.subarray(0, m * 8)); return out; }
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let P = Math.round(m * 0.6180339887);
    while (gcd(P, m) !== 1) P++;
    for (let i = 0, o = 0, k = Math.floor(rand() * m); i < m; i++) { let j = k * 8; for (let c = 0; c < 8; c++) out[o++] = G[j++]; k += P; if (k >= m) k -= m; }
    return out;
  };
  return { st: shuffled(tmpS, n), n, bl: shuffled(tmpB, nb), nB: nb, src: src ? [src[0], src[1]] : [0.12 * A, 0.6] };
}

/* ==================================================================== the loop's scenes (v5)
 * After the intro the hero runs a loop over the same grains: the silk, then the hand, then the
 * dunes, then the silk again. Every grain has a place in each scene. The hand and the dunes are laid
 * out once per card size, off the main thread, and each of their grains is matched to a grain of the
 * silk so that the three scenes line up (see matchScenes). */
const LOOP = { hold: 10.0, tr: [3.9, 3.5, 3.5], front0: 0.10, front: 0.70, land0: 1.15, land: 1.65 };
  // seconds: each scene's hold; each change (silk -> hand, hand -> dunes, dunes -> silk: the hand takes
  // a little longer to arrive, so it eases in); the gust front's start and its sweep across the card
  // (right to left); when the new scene starts to settle and how long it takes to fill in (left to right)
const SCENES = ['silk', 'hand', 'dunes'];
const TR_WIND = (() => { const x = -0.93, y = -0.36, l = Math.hypot(x, y); return [x / l, y / l]; })();   // a change's wind: left, a little up
const TR_LANES = 96;        // lanes across a change's wind (see matchScenes)
const TR_MARGIN = 0.05;     // how far (scene units) past the card's edge sand that goes round turns back
const CLOCK_BASE = 20;      // a scene's clock starts again here while it is off screen (see rebase)
/* the hand */
const HAND_BOX = [10, 14, 90, 122];   // the model's extent, in its units (y down)
const HAND_RES = 4;                   // model cells per unit
const HAND_LIGHT = { az: Math.atan2(-0.62, -0.60), el: 0.30 };   // low, from the upper left, as the silk's: the planes turned to it catch it
const HAND_GAIN = 1.0;                // the hand's brightness against the silk's
const HAND_WIND = [-0.13, -0.05];     // the wind that takes sand off the hand's left side (scene units per second)
const HAND_SHARE = [0.46, 0.22];      // shares of the grains: the hand's body, its blowers (the rest lie in its shade)

/* Where the hand sits in the card (scene units per unit of the model, and the model's origin). On a
   desktop card it stands large in the left half, clear of the copy; on a phone it stands above the
   copy, about two thirds of the card's width, its fingertips clear of the nav (navB: the nav's bottom,
   scene units). */
function handLayout(A, cssH, navB) {
  let k, xL, yT;
  if (A >= 0.95) {
    k = Math.min(0.76 / 72, 0.40 * A / 66);          // palm and fingers (y 17..98) about four fifths of the card's height
    xL = Math.max(0.035 * A, 0.255 * A - 32 * k);     // the thumb's tip (x 16)
    yT = 0.535 - 39 * k;                              // the middle fingertip (y 17)
  } else {
    k = Math.min(0.72 * A / 62, 0.40 / 82);
    xL = 0.5 * A - 31 * k;
    yT = Math.max(0.05, (navB || 0.085) + 24 / Math.max(1, cssH));
  }
  const x0 = xL - 16 * k, y0 = yT - 17 * k;
  return { k, x0, y0, pivot: [x0 + 51 * k, y0 + 112 * k], portrait: A < 0.95 };
}

function blurJS(src, w, h, r, passes) {
  const a = Float32Array.from(src), b = new Float32Array(w * h);
  if (r < 1) return a;
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w; let acc = 0;
      for (let i = -r; i <= r; i++) acc += a[o + Math.min(Math.max(i, 0), w - 1)];
      for (let x = 0; x < w; x++) { b[o + x] = acc * inv; acc += a[o + Math.min(x + r + 1, w - 1)] - a[o + Math.max(x - r, 0)]; }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += b[Math.min(Math.max(i, 0), h - 1) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = acc * inv; acc += b[Math.min(y + r + 1, h - 1) * w + x] - b[Math.max(y - r, 0) * w + x]; }
    }
  }
  return a;
}
/* The loop's hand, modelled (no Path2D, so it runs in the worker). An open raised hand, palm to the
   viewer, thumb on the left (as the brand's hand): tapered fingers that fan out a little, each with
   its joints, a two-segment thumb angled out from a fleshy base, a palm with a heel on each side, and
   a wrist that narrows before it fades into the dark. Built as a 2D signed distance (the silhouette)
   and a height over it (the relief the light falls on), in the units of HAND_BOX (y down; the palm
   spans about y 55..98, the middle fingertip reaches y 20). Returns, per cell of a gw x gh grid at res
   cells per unit: cov (0..1 inside), h (height, units), crease (0..1, how deep in a crease) and sd
   (the signed distance to the edge, units, < 0 inside). */
function handField(res) {
  const X0 = HAND_BOX[0], Y0 = HAND_BOX[1], gw = (HAND_BOX[2] - HAND_BOX[0]) * res, gh = (HAND_BOX[3] - HAND_BOX[1]) * res;
  const N = gw * gh, cov = new Float32Array(N), h = new Float32Array(N), crease = new Float32Array(N), sd = new Float32Array(N);
  const D2R = Math.PI / 180;
  // fingers: base (where it leaves the palm), lean from upright (degrees, + to the right), length,
  // radius at the base and at the tip. The fan's lean opens the gaps between them towards the tips.
  const F = [
    { b: [38.6, 58.5], a: -7.5, L: 32.0, r0: 4.55, r1: 3.55 },   // index
    { b: [49.4, 56.0], a: -1.5, L: 35.0, r0: 4.75, r1: 3.70 },   // middle
    { b: [60.0, 57.5], a: 4.5, L: 32.5, r0: 4.50, r1: 3.50 },    // ring
    { b: [69.6, 62.0], a: 11.0, L: 25.5, r0: 3.95, r1: 3.05 },   // little
  ];
  // the thumb: from its base in the palm's heel, out and up to the left in two segments
  const TH = [[41.5, 88.5], [30.2, 75.0], [23.8, 62.4], [20.2, 51.8]], THR = [7.4, 5.2, 4.55, 3.9];
  const segs = [];
  for (const f of F) {
    const d = [Math.sin(f.a * D2R), -Math.cos(f.a * D2R)];
    // three phalanges, each bent a touch further than the last (fingers at rest curl very slightly
    // towards the middle one)
    const P = [0.46, 0.29, 0.25], bend = (f.a < 0 ? 1 : -1) * 1.2 * D2R;
    let p = [f.b[0] - d[0] * 6, f.b[1] - d[1] * 6], ang = Math.atan2(d[1], d[0]), acc = -6 / f.L;
    for (let i = 0; i < 3; i++) {
      const l = f.L * P[i] + (i === 0 ? 6 : 0);
      const q = [p[0] + Math.cos(ang) * l, p[1] + Math.sin(ang) * l];
      const t0 = acc, t1 = acc + l / f.L;
      segs.push({ a: p, b: q, ra: f.r0 + (f.r1 - f.r0) * Math.max(0, t0) + (t0 < 0 ? 0.6 : 0), rb: f.r0 + (f.r1 - f.r0) * t1, kind: 'f', t0, t1, L: f.L, last: i === 2, joint: i > 0 });
      p = q; ang += bend; acc = t1;
    }
  }
  for (let i = 0; i < 3; i++) segs.push({ a: TH[i], b: TH[i + 1], ra: THR[i], rb: THR[i + 1], kind: 't', t0: i / 3, t1: (i + 1) / 3, L: 40, last: i === 2, joint: i > 0 });
  const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const smin = (a, b, k) => { const t = cl(0.5 + 0.5 * (b - a) / k); return b + (a - b) * t - k * t * (1 - t); };
  const smax = (a, b, k) => -smin(-a, -b, k);
  // distance to a segment with a radius that changes along it; also where along it (0..1) and how far
  // from its axis
  const seg = (s, x, y) => {
    const bx = s.b[0] - s.a[0], by = s.b[1] - s.a[1], l2 = bx * bx + by * by;
    const u = cl(((x - s.a[0]) * bx + (y - s.a[1]) * by) / l2);
    const dx = x - s.a[0] - bx * u, dy = y - s.a[1] - by * u, dd = Math.hypot(dx, dy);
    return { d: dd - (s.ra + (s.rb - s.ra) * u), u, dd, r: s.ra + (s.rb - s.ra) * u };
  };
  // the palm: a rounded box that narrows towards the wrist, with the two heels (thenar, hypothenar)
  const ell = (x, y, cx, cy, rx, ry, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot), px = (x - cx) * c + (y - cy) * s, py = -(x - cx) * s + (y - cy) * c;
    const k = Math.hypot(px / rx, py / ry);
    return (k - 1) * Math.min(rx, ry);
  };
  const palmD = (x, y) => {
    // half-width narrows from the knuckles (y 60) to the wrist (y 100)
    const cy = 77, hy = 21.5, w = 20.2 - 3.6 * cl((y - 62) / 38), cx = 54.6 - 1.2 * cl((y - 62) / 38);
    const qx = Math.abs(x - cx) - (w - 6), qy = Math.abs(y - cy) - (hy - 6);
    const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 6;
    const then = ell(x, y, 40.5, 84.5, 9.6, 13.2, -0.32), hypo = ell(x, y, 68.5, 83.0, 7.4, 13.0, 0.10);
    const wrist = seg({ a: [51.0, 94], b: [51.8, 126], ra: 13.6, rb: 10.6 }, x, y).d;
    return smin(smin(smin(box, then, 3.0), hypo, 3.0), wrist, 5.0);
  };
  // gentle grooves: the creases across each finger at its joints and at its base, and the palm's lines
  const groove = (d, w) => Math.exp(-(d * d) / (w * w));
  const lineD = (x, y, pts) => { let m = 1e9; for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, Math.abs(seg({ a: pts[i], b: pts[i + 1], ra: 0, rb: 0 }, x, y).d)); return m; };
  const HEART = [[76, 69], [66, 66.5], [56, 65.8], [47.5, 63.2]], HEAD = [[35.5, 71.5], [45, 72.2], [55, 75.2], [63, 79.5]];
  const LIFE = [[36.2, 71.2], [42.0, 78.0], [46.0, 86.5], [47.2, 96.5]], WRISTL = [[39, 98.8], [51, 100.2], [63, 98.6]];
  for (let j = 0; j < gh; j++) {
    const y = Y0 + (j + 0.5) / res;
    for (let i = 0; i < gw; i++) {
      const x = X0 + (i + 0.5) / res, o = j * gw + i;
      let dP = palmD(x, y);
      // palm relief: rounded at its rim, the heels swell, the hollow in the middle, pads under the fingers
      let hP = dP < 0 ? 5.4 * (1 - Math.exp(dP / 2.6)) : 0;
      if (dP < 0) {
        const b = (cx, cy, r, a) => a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r));
        hP += b(40.5, 84, 8, 2.8) + b(69, 84, 7, 1.7) + b(55, 74, 9, -1.8) + b(39.5, 62.5, 4, 0.9) + b(50, 60.5, 4, 1.0) + b(60.5, 62, 4, 0.9) + b(70, 66, 3.6, 0.8);
        hP *= 1 - 0.55 * cl((y - 96) / 22);                 // the wrist is lower than the palm
      }
      let d = dP, hh = hP, cr = 0;
      for (const s of segs) {
        const r = seg(s, x, y);
        if (r.d > 3.5) { d = smin(d, r.d, s.kind === 't' ? 3.2 : 1.6); continue; }
        // a finger is a soft cylinder, a little flattened; its tip is rounded
        const cyl = r.d < 0 ? Math.sqrt(Math.max(0, r.r * r.r - r.dd * r.dd)) * 0.92 : 0;
        const base = s.kind === 't' ? 3.5 + 1.2 * (1 - s.t0) : 3.6;   // fingers sit on the palm's surface
        const along0 = s.t0 + (s.t1 - s.t0) * r.u;
        // it rises out of the palm (fingers) or out of its fleshy base (the thumb)
        const rise = s.kind === 'f' ? cl((along0 * s.L + 5) / 6) : (s.t0 < 0.1 ? cl(r.u * 1.6 - 0.2) : 1);
        // continuous to the silhouette: it falls to nothing at its own edge, so the palm covers its buried end
        let hf = (base * rise + cyl * (0.25 + 0.75 * rise)) * cl(-r.d / 1.0);
        // creases across the finger at each joint (and where it leaves the palm), deepest mid-finger
        const along = along0, Lu = s.L * (s.kind === 't' ? 0.9 : 1);
        let g = 0;
        if (s.kind === 'f') {
          for (const tj of [0.02, 0.46, 0.75]) g = Math.max(g, groove((along - tj) * Lu, 0.95));
        } else {
          for (const tj of [0.36, 0.69]) g = Math.max(g, groove((along - tj) * Lu, 0.8));
        }
        g *= cyl > 0 ? Math.min(1, cyl / (0.6 * r.r)) : 0;
        hf -= 0.45 * g;
        // the pads between the creases swell a touch
        if (cyl > 0 && s.last) hf += 0.35 * Math.sin(Math.PI * cl((along - 0.75) / 0.25));
        cr = Math.max(cr, g);
        d = smin(d, r.d, s.kind === 't' ? 3.2 : 1.6);
        hh = smax(hh, hf, 2.2);
      }
      // the palm's lines
      if (dP < -1) {
        const gl = Math.max(groove(lineD(x, y, HEART), 0.9), groove(lineD(x, y, HEAD), 0.85) * 0.6, groove(lineD(x, y, LIFE), 1.0) * 0.9, groove(lineD(x, y, WRISTL), 0.9) * 0.5);
        const w = cl(-dP / 2);
        hh -= 0.45 * gl * w; cr = Math.max(cr, gl * 0.8 * w);
      }
      cov[o] = cl(0.5 - d * res);
      h[o] = d < 0.5 ? hh : 0;
      crease[o] = cr; sd[o] = d;
    }
  }
  return { cov, h, crease, sd, gw, gh };
}
/* The hand in grain: stippled from the model with the light (dense where it is lit, sparse in shadow,
   with no thinning at the edges, so the silhouette stays crisp; the far side falls away to near black).
   Each grain carries its normal, so the GPU lights it with a light that drifts a little. Along the
   left-facing skin (the thumb, the first finger, the palm's left edge, the fingertips) many grains are
   blowers, which the wind takes off to the left as the silk's.
   Returns Float32Array, 8 per grain: x, y (scene units), normal x, y, occlusion (with the soft pool of
   light from the upper left), energy per grain, share of time in the air (0: stays), and a slot that
   matchScenes fills with the grain's flags. */
function handSample(lay, n, avgArea, cssH, seed) {
  const RES = HAND_RES, X0 = HAND_BOX[0], Y0 = HAND_BOX[1], rand = mulberry32(seed);
  const F = handField(RES), gw = F.gw, gh = F.gh, N = gw * gh;
  const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const hs = blurJS(F.h, gw, gh, 1, 1), hb = blurJS(hs, gw, gh, Math.round(2.4 * RES), 2);
  const L = [Math.cos(HAND_LIGHT.az) * Math.cos(HAND_LIGHT.el), Math.sin(HAND_LIGHT.az) * Math.cos(HAND_LIGHT.el), Math.sin(HAND_LIGHT.el)];
  const Lh = Math.hypot(L[0], L[1]);
  const w = new Float32Array(N), nx = new Float32Array(N), ny = new Float32Array(N), ao = new Float32Array(N), em = new Float32Array(N);
  let W = 0;
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    const i = y * gw + x, c = F.cov[i];
    if (c <= 0.02) continue;
    const gx = (hs[i + 1] - hs[i - 1]) * 0.5 * RES, gy = (hs[i + gw] - hs[i - gw]) * 0.5 * RES;
    let vx = -gx, vy = -gy, vz = 1; const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
    const ux = X0 + (x + 0.5) / RES, uy = Y0 + (y + 0.5) / RES;
    // occlusion: between the fingers, in the palm's hollow and in the creases at the joints
    const a = (1 - Math.min(0.5, Math.max(0, hb[i] - hs[i]) * 0.22)) * (1 - 0.3 * F.crease[i]);
    const sx = ux - 40, sy = uy - 42, spot = 0.30 + 0.85 * Math.exp(-(sx * sx + sy * sy) / (38 * 38));   // a soft pool of light, upper left
    const wrist = 1 - sstep(99, 118, uy);
    const d = Math.max(0, (vx * L[0] + vy * L[1] + vz * L[2] + 0.08) / 1.08);
    const rim = Math.pow(1 - vz, 2) * Math.max(0, (vx * L[0] + vy * L[1]) / (Math.hypot(vx, vy) * Lh + 1e-5));
    const lit = (Math.pow(d, 1.8) * 1.1 + 0.35 * rim + 0.010) * a * spot;
    const dens = c * wrist * (0.05 + 0.95 * Math.pow(Math.min(lit, 1.2), 1.2));
    w[i] = dens; W += dens;
    nx[i] = vx; ny[i] = vy; ao[i] = a * spot * wrist;
    // blowers: left- and up-facing skin within about three units of the edge
    const din = -F.sd[i], xl = (ux - 16) / 62;
    const skin = 1 - sstep(0.4, 3.2, din), facing = cl(0.30 - vx * 0.95 - vy * 0.45);
    const reach = Math.max(1 - sstep(0.30, 0.62, xl), cl((31 - uy) / 8) * (1 - sstep(0.55, 0.85, xl)));
    em[i] = skin * facing * reach * wrist * (1 - sstep(90, 102, uy));
  }
  // Three kinds of grain, so that the lit skin is made of distinct, sparkling grains (as the silk is),
  // never a frosted fill: the body (HAND_SHARE[0], with the light), the blowers (HAND_SHARE[1], on the
  // left-facing skin) and the rest in the shade (few there are lit at all, so they are near black)
  const nB = Math.round(n * HAND_SHARE[0]), nW = Math.round(n * HAND_SHARE[1]), nS = n - nB - nW;
  const pxArea = Math.pow(lay.k / RES * cssH, 2), out = new Float32Array(n * 8);
  let m = 0;
  const stipple = (wt, count, fill) => {
    let S = 0;
    for (let i = 0; i < N; i++) S += wt(i);
    if (S <= 0) return;
    const k = count / S, end = m + count;
    let cs = rand();
    for (let y = 0; y < gh && m < end; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x, v = wt(i);
      if (!(v > 0)) continue;
      cs += v * k;
      let ms = Math.floor(cs); cs -= ms;
      for (; ms > 0 && m < end; ms--, m++) {
        const o = m * 8, ux = X0 + (x + rand()) / RES, uy = Y0 + (y + rand()) / RES;
        out[o] = lay.x0 + ux * lay.k; out[o + 1] = lay.y0 + uy * lay.k;
        out[o + 2] = nx[i]; out[o + 3] = ny[i]; out[o + 4] = ao[i]; out[o + 7] = 0;
        fill(o, i, v * k);
      }
    }
  };
  // light per area rises with the density (the square root of the cover), so what is lit is both
  // dense and bright, and the grains in the shade are few and dim
  stipple((i) => w[i], nB, (o, i, per) => { out[o + 5] = Math.min(4, Math.pow(pxArea / (per * avgArea), 0.5)); out[o + 6] = 0; });
  stipple((i) => (w[i] > 0 ? em[i] : 0), nW, (o, i) => { out[o + 5] = 0.9; out[o + 6] = 0.45 + 0.35 * em[i] + 0.1 * rand(); });
  stipple((i) => (w[i] > 0 ? F.cov[i] * Math.max(0, 0.35 - w[i]) : 0), nS, (o) => { out[o + 5] = 0.5; out[o + 6] = 0; });
  for (let i = m; i < n; i++) { const j = (i % Math.max(1, m)) * 8; out.copyWithin(i * 8, j, j + 8); out[i * 8 + 5] = 0; }   // spares (few, if any)
  return out;
}

/* Grains in order: cut by Y into K bands of equal count, each band ordered by X (counting sorts). */
function bandOrder(X, Y, n, K) {
  const B = 1024;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = X[i], y = Y[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const sy = B / Math.max(1e-9, y1 - y0) * 0.9999, sx = B / Math.max(1e-9, x1 - x0) * 0.9999;
  const cnt = new Uint32Array(B + 1), o1 = new Uint32Array(n), out = new Uint32Array(n);
  for (let i = 0; i < n; i++) cnt[((Y[i] - y0) * sy | 0) + 1]++;
  for (let b = 0; b < B; b++) cnt[b + 1] += cnt[b];
  for (let i = 0; i < n; i++) o1[cnt[(Y[i] - y0) * sy | 0]++] = i;
  for (let b = 0; b < K; b++) {
    const s = Math.floor(b * n / K), e = Math.floor((b + 1) * n / K);
    cnt.fill(0);
    for (let j = s; j < e; j++) cnt[((X[o1[j]] - x0) * sx | 0) + 1]++;
    for (let q = 0; q < B; q++) cnt[q + 1] += cnt[q];
    for (let j = s; j < e; j++) { const i = o1[j]; out[s + cnt[(X[i] - x0) * sx | 0]++] = i; }
  }
  return out;
}
// a scene's places in lanes across a change's wind, each lane ordered downwind (a: how far downwind)
function laneOrder(X, Y, n) {
  const W = TR_WIND, a = new Float32Array(n), c = new Float32Array(n);
  for (let i = 0; i < n; i++) { a[i] = X[i] * W[0] + Y[i] * W[1]; c[i] = Y[i] * W[0] - X[i] * W[1]; }
  return { o: bandOrder(a, c, n, TR_LANES), a };
}
// the smallest shift, in one lane [s, e), that puts every place of T at or downwind of its grain in F
function minShift(F, T, s, e) {
  let best = 0, j = s;
  for (let k = s; k < e; k++) {
    const v = F.a[F.o[k]] - 0.004;
    while (j < e && T.a[T.o[j]] < v) j++;
    if (j - k > best) best = j - k;
  }
  return best;
}
/* Matching the scenes. A change carries every grain from its place in one scene to its place in the
   next, always down the wind (never back against it). So the scenes are matched lane by lane: each
   scene's places are cut into TR_LANES lanes across the change's wind (equal counts, so lane b of one
   scene is lane b of the next) and ordered downwind within each lane. In a lane the k-th grain of one
   scene takes the (k + s)-th place of the next, where the shift s is the smallest that keeps every
   place at or downwind of its grain. The last s grains of the lane have no place downwind: they blow
   off the card's downwind edge and come back in on the gust from upwind, to the first s places (they
   go round; see heroGrain). The map keeps neighbours together and never crosses itself, so the sand
   flows as a sheet in lanes. Round the loop the shifts add up to a whole lane (or two), shared out as
   evenly as the scenes allow: the sand in each lane turns over about once per loop.
   P: each scene's places as [X, Y] (silk first; the silk's order is the grains' order). Returns, per
   scene after the silk, the index of the place each grain takes, and each grain's flags: bit i set
   when it goes round in the change out of scene i (bit 3: from the hand straight back to the silk,
   when there are no dunes).
   keep (v7): each lane's first shift from an earlier match of the same silk and hand (the hand is laid
   out on its own first; see pumpScenes). Kept, every grain takes the same place in the hand as before,
   so the dunes join without a grain moving; only the later shifts are shared out. A lane whose kept
   shift leaves too little room for the rest is matched afresh. Returns each lane's first shift. */
function matchScenes(P, n, keep) {
  const S = P.map((p) => laneOrder(p[0], p[1], n)), m = S.length;
  const idx = P.slice(1).map(() => new Uint32Array(n)), flags = new Float32Array(n);
  const K = TR_LANES, stats = [0, 0, 0, 0], first = new Int32Array(K);
  for (let b = 0; b < K; b++) {
    const s = Math.floor(b * n / K), e = Math.floor((b + 1) * n / K), len = e - s;
    if (!len) continue;
    const need = [];
    for (let i = 0; i < m; i++) need.push(Math.min(len, minShift(S[i], S[(i + 1) % m], s, e)));
    let fix = keep && keep.length === K ? Math.max(need[0], keep[b] | 0) : -1;
    if (fix >= 0) {
      const t = len * Math.max(1, Math.ceil((fix + need.slice(1).reduce((x, y) => x + y, 0)) / len));
      if (fix > len || fix + (m - 1) * len < t) fix = -1; else need[0] = fix;
    }
    const free = (i) => fix < 0 || i > 0;
    const sum = need.reduce((x, y) => x + y, 0), total = len * Math.max(1, Math.ceil(sum / len));
    // share out the rest (total - sum) so the largest shift is as small as it can be
    let lo = 0, hi = len;
    for (let it = 0; it < 24; it++) { const L = (lo + hi) / 2; if (need.reduce((x, y, i) => x + (free(i) ? Math.max(y, L) : y), 0) < total) lo = L; else hi = L; }
    const sh = need.map((x, i) => free(i) ? Math.max(x, Math.floor(hi)) : x);
    let rest = total - sh.reduce((x, y) => x + y, 0);
    for (let i = 0; rest > 0; i = (i + 1) % m) if (free(i) && sh[i] < len) { sh[i]++; rest--; }
    for (let i = m - 1; rest < 0; i = (i + m - 1) % m) if (sh[i] > need[i]) { sh[i]--; rest++; }
    first[b] = sh[0];
    for (let k = 0; k < len; k++) {
      let j = k, f = 0;
      for (let i = 0; i < m; i++) {
        j += sh[i];
        if (j >= len) { j -= len; f |= 1 << (m === 2 && i === 1 ? 3 : i); stats[i]++; }
        if (i < m - 1) idx[i][S[0].o[s + k]] = S[i + 1].o[s + j];
      }
      flags[S[0].o[s + k]] = f;
    }
  }
  return { idx, flags, first, round: stats.slice(0, m).map((x) => +(x / n).toFixed(3)) };
}
/* Everything the loop needs from the CPU, for one card size: the silk's resting places (to match
   against), the hand and the dunes, each in the silk's grain order (the anchored set, then the
   flying set). Pure: runs in a worker. */
function buildScenes(a) {
  const N = a.nA + a.nF, X = new Float32Array(N), Y = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const g = i < a.nA ? a.anch : a.fly, j = i < a.nA ? i : i - a.nA;
    const p = surfJS(a.layers[g[4 * j + 2] | 0], g[4 * j], g[4 * j + 1], a.t);
    X[i] = p[0]; Y[i] = p[1];
  }
  const H0 = handSample(a.lay, N, a.avgArea, a.cssH, a.seed);
  let D0 = null, dsrc = null;
  if (a.bake) {
    const nB = Math.round(N * a.blow), d = stippleDunes(a.bake.px, a.bake.bw, a.bake.bh, a.A, a.cssH, N - nB, nB, a.avgArea, a.seed + 1);
    D0 = new Float32Array(N * 8);
    D0.set(d.st.subarray(0, d.n * 8));
    D0.set(d.bl.subarray(0, d.nB * 8), d.n * 8);
    // if the crests gave fewer blowers than asked, the rest rest on the dunes, unlit (they still fly in a change)
    for (let i = d.n + d.nB; i < N; i++) { const j = (i % Math.max(1, d.n)) * 8; D0.copyWithin(i * 8, j, j + 8); D0[i * 8 + 2] = 0; }
    dsrc = d.src;
  }
  const XY = (G) => { const x = new Float32Array(N), y = new Float32Array(N); for (let i = 0; i < N; i++) { x[i] = G[8 * i]; y[i] = G[8 * i + 1]; } return [x, y]; };
  const M = matchScenes(D0 ? [[X, Y], XY(H0), XY(D0)] : [[X, Y], XY(H0)], N, a.keep || null);
  const pick = (G, ix) => { const out = new Float32Array(N * 8); for (let i = 0; i < N; i++) out.set(G.subarray(8 * ix[i], 8 * ix[i] + 8), 8 * i); return out; };
  const H = pick(H0, M.idx[0]), D = D0 ? pick(D0, M.idx[1]) : null;
  for (let i = 0; i < N; i++) H[8 * i + 7] = M.flags[i];
  return { H, D, dsrc, round: M.round, first: M.first };
}
let SCENE_WORKER = null, SCENE_SEQ = 0, SCENE_REFS = 0;
const SCENE_WAITS = new Map();
/* The worker that lays out the hand and the dunes, made from these functions' own source, so the hero
   plays on meanwhile. Shared by every scene on the page, and closed with the last of them. */
function sceneWorker() {
  if (SCENE_WORKER !== null) return SCENE_WORKER;
  try {
    // Cue: a same-origin module worker keeps the original layout off the main thread
    // without requiring blob: workers or relaxing the website's content-security policy.
    const wk = new Worker(new URL('./raisedhand-grain-worker.js', import.meta.url), { type: 'module' });
    wk.onmessage = (e) => { const w = SCENE_WAITS.get(e.data.id); if (w) { SCENE_WAITS.delete(e.data.id); w(e.data.error ? null : e.data); } };
    wk.onerror = (e) => { e.preventDefault(); wk.terminate(); SCENE_WORKER = false; SCENE_WAITS.forEach((w) => w(null)); SCENE_WAITS.clear(); };
    SCENE_WORKER = wk;
  } catch (err) { SCENE_WORKER = false; }
  return SCENE_WORKER;
}
/* buildScenes in the worker. Without one the loop stays on the silk: the layout takes seconds on a
   phone, too long for the main thread. The bake's pixels are handed over, not copied. */
function buildScenesOffThread(args) {
  const wk = sceneWorker();
  if (!wk) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = ++SCENE_SEQ;
    SCENE_WAITS.set(id, resolve);
    try { wk.postMessage({ id, args }, args.bake ? [args.bake.px.buffer] : []); } catch (err) { SCENE_WAITS.delete(id); resolve(null); }
  });
}
function releaseSceneWorker() {
  if (--SCENE_REFS > 0) return;
  SCENE_REFS = 0;
  if (SCENE_WORKER) SCENE_WORKER.terminate();
  SCENE_WORKER = null;
  SCENE_WAITS.forEach((w) => w(null)); SCENE_WAITS.clear();
}
/* ==================================================================== end of the scenes (JS) */

/* ------------------------------------------------------------------ shaders */
const COMMON = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec4 a_g;   // u, v, layer, erosion
layout(location=1) in vec4 a_i;   // intro: mark x, y (scene), luminance (<0: not part of the mark), mint
layout(location=2) in vec2 a_j;   // intro: depth from the windward edge (scene), position across the lockup 0..1
uniform float u_time;
uniform float u_aspect;
uniform vec3  u_px;       // point sizes in device px: small, base, large
uniform float u_gain;
uniform vec2  u_P[12];
uniform vec4  u_W[3];
uniform vec4  u_T[3];
uniform vec4  u_M[3];
uniform vec4  u_E[3];
uniform vec4  u_pool;
uniform vec4  u_R[${MAX_RECTS}];   // calm zones (copy, nav): x0 y0 x1 y1, scene units
uniform float u_Rs[${MAX_RECTS}];
uniform int   u_Rn;
uniform vec2  u_wind;
uniform float u_turb;
uniform uint  u_set;
uniform float u_intro;    // 1 while the intro runs
uniform float u_ti;       // intro clock
uniform float u_tg;       // when the gust starts (intro clock)
uniform float u_itgt;     // v6: where the intro settles: 1 the hand (the loop's first scene), 0 the silk if the hand is not laid out in time
uniform float u_logoE;    // energy of one grain of the mark
uniform vec4  u_xf;       // scene units -> canvas CSS px: offset x, offset y, px per scene unit
uniform vec2  u_vp;       // canvas size, CSS px
uniform vec3  u_clip;     // page mode: keep grains in the card (0/1), corner radius, bottom fade (scene units)
out vec3 v_col;
const float TAU = 6.2831853;
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(uint id, uint k){ return float(pcg(id * 16u + k)) * (1.0 / 4294967296.0); }
vec2 bez(int L, float u){ int i = L * 4; float m = 1.0 - u; return m*m*m*u_P[i] + 3.0*m*m*u*u_P[i+1] + 3.0*m*u*u*u_P[i+2] + u*u*u*u_P[i+3]; }
vec2 bezD(int L, float u){ int i = L * 4; float m = 1.0 - u; return 3.0*m*m*(u_P[i+1]-u_P[i]) + 6.0*m*u*(u_P[i+2]-u_P[i+1]) + 3.0*u*u*(u_P[i+3]-u_P[i+2]); }
vec3 surf(int L, float u, float v, float t){
  vec4 W = u_W[L], T = u_T[L], M = u_M[L];
  vec2 tg = normalize(bezD(L, u));
  vec2 ns = vec2(-tg.y, tg.x);
  vec2 c = bez(L, u) + ns * (M.z * sin(TAU * 1.1 * u - 0.35 * t + M.w));
  float cz = M.z * 3.0 * sin(TAU * 0.9 * u - 0.27 * t + 1.0 + M.w);
  float th = T.x + T.y * sin(TAU * T.z * u + T.w - 0.11 * t);
  vec3 B = vec3(ns * cos(th), sin(th));
  vec3 N = cross(vec3(tg, 0.0), B);
  float z = (u - W.z) / W.w;
  float w = W.x * (W.y + (1.0 - W.y) * exp(-z * z));
  float r = M.y * w * (0.55 * sin(3.14159 * 1.1 * v + TAU * 0.8 * u - 0.30 * t + M.w)
                     + 0.26 * sin(3.14159 * 2.3 * v + TAU * 1.5 * u + 1.0 - 0.42 * t)
                     + 0.10 * sin(3.14159 * 4.7 * v + TAU * 2.4 * u + 2.0 - 0.55 * t));
  return vec3(c, cz) + B * (v * w) + N * r;
}
// the ribbon's far end is kept dim under the nav and the call to action (top right)
float topRight(vec2 p){
  if (u_aspect >= 0.95) return smoothstep(0.50 * u_aspect, 0.90 * u_aspect, p.x) * (1.0 - smoothstep(0.10, 0.46, p.y));
  return smoothstep(0.50 * u_aspect, 1.0 * u_aspect, p.x) * (1.0 - smoothstep(0.03, 0.20, p.y));
}
float shade(int L, float u, float v, float t, vec3 p){
  vec3 du = surf(L, u + 0.0008, v, t) - p;
  vec3 dv = surf(L, u, v + 0.003, t) - p;
  vec3 n = normalize(cross(du, dv));
  if (n.z < 0.0) n = -n;
  vec3 Ld = normalize(vec3(-0.35, -0.80, 0.42));
  vec3 H = normalize(Ld + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(n, Ld), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 40.0);
  vec4 E = u_E[L];
  float edge = v > 0.0 ? 1.0 - smoothstep(E.x, 1.0, v) : 1.0 - smoothstep(E.y, 1.0, -v);
  vec2 pc = (p.xy - u_pool.xy) / u_pool.zw;
  float pool = 0.20 + 0.80 * exp(-dot(pc, pc));
  // where the sheet turns edge-on its grains crowd (density ~ 1/n.z): fade them faster than that,
  // so a fold never draws a thin bright hem line
  float proj = smoothstep(0.02, 0.62, n.z);
  proj *= proj;
  return u_M[L].x * edge * pool * proj * (1.0 - 0.80 * topRight(p.xy)) * (0.03 + 1.05 * pow(diff, 1.3) + 0.95 * spec);
}
float quietF(vec2 p, float f){   // f: the feather, which lies outside each rect, so everything under the text is fully calm
  float q = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= u_Rn) break;
    vec4 r = u_R[i];
    float qx = smoothstep(r.x - f, r.x, p.x) * (1.0 - smoothstep(r.z, r.z + f, p.x));
    float qy = smoothstep(r.y - f, r.y, p.y) * (1.0 - smoothstep(r.w, r.w + f, p.y));
    q = max(q, qx * qy * u_Rs[i]);
  }
  return q;
}
float quiet(vec2 p){ return quietF(p, 0.13); }
vec3 palette(float b){
  vec3 deep  = vec3(0.032, 0.046, 0.096);
  vec3 sage  = vec3(0.306, 0.348, 0.472);
  vec3 cream = vec3(0.950, 0.870, 0.690);
  vec3 c = mix(deep, sage, smoothstep(0.04, 0.50, b));
  return mix(c, cream, smoothstep(0.50, 1.05, b));
}
vec4 toClip(vec2 p){ vec2 s = u_xf.xy + p * u_xf.z; return vec4(s.x / u_vp.x * 2.0 - 1.0, 1.0 - s.y / u_vp.y * 2.0, 0.0, 1.0); }
// page mode: the card is no longer a canvas of its own, so its grains are kept inside it (rounded top
// corners) and melt away over its bottom edge, as the card itself does
float cardMask(vec2 p){
  if (u_clip.x < 0.5) return 1.0;
  vec2 q = vec2(min(p.x, u_aspect - p.x), p.y);
  if (q.x < 0.0 || q.y < 0.0) return 0.0;
  float r = u_clip.y;
  if (q.x < r && q.y < r && length(vec2(r) - q) > r) return 0.0;
  return 1.0 - smoothstep(1.0 - u_clip.z, 1.0, p.y);
}
float pickSize(float r){ return r < 0.10 ? u_px.z : (r < 0.34 ? u_px.x : u_px.y); }

// 3D simplex noise with analytic gradient (after Gustavson and McEwan, MIT licence)
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
vec3 snoiseGrad(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3));
  vec4 temp = m2 * m * pdotx;
  vec3 grad = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  grad += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  return grad * 105.0;
}
// divergence-free wind: curl of two octaves of slowly evolving noise
vec2 curl(vec2 p, float t){
  vec3 g1 = snoiseGrad(vec3(p * 1.2, t * 0.07));
  vec3 g2 = snoiseGrad(vec3(p * 3.6 + vec2(7.3, 1.9), t * 0.15 + 3.0));
  return vec2(g1.y, -g1.x) * 1.2 + vec2(g2.y, -g2.x) * (3.6 * 0.25);
}
`;

/* the three kinds of silk grain. Each defines silk(id, p, c, sz): position, energy, point size */
const SILK_ANCH = `
void silkAt(uint id, float T, out vec2 p, out vec3 c, out float sz){
  int L = int(a_g.z + 0.5);
  vec3 p3 = surf(L, a_g.x, a_g.y, T);
  float lum = shade(L, a_g.x, a_g.y, T, p3) * (1.0 - quiet(p3.xy));
  float k = (0.04 + lum) * (0.75 + 0.5 * rnd(id, 7u)) * u_gain;
  p = p3.xy; c = palette(lum) * k; sz = pickSize(rnd(id, 0u));
}
void silk(uint id, out vec2 p, out vec3 c, out float sz){ silkAt(id, u_time, p, c, sz); }`;

const SILK_FLY = `
void silkAt(uint id, float T, out vec2 p, out vec3 c, out float sz){
  int L = int(a_g.z + 0.5);
  float u = a_g.x, v = a_g.y, e = a_g.w;
  float r1 = rnd(id, 1u), r2 = rnd(id, 2u), r3 = rnd(id, 3u), r4 = rnd(id, 4u), r5 = rnd(id, 5u), r6 = rnd(id, 6u);
  // neighbouring grains share most of their timing, so patches of the sheet lift off together
  // and the wind combs them out into fine streaks along the ribbon instead of an even spray
  float g1 = 0.5 + 0.5 * sin(u * 26.0 + 2.0 * sin(v * 3.0 + u * 7.0));
  float g2 = 0.5 + 0.5 * sin(v * 5.0 - u * 21.0 + 1.3);
  float F = mix(4.5, 7.5, 0.35 * r1 + 0.65 * g2);  // seconds in the air
  float sh = 1.0 - 0.975 * pow(e, 0.8);            // share of each cycle spent on the silk
  float R = F * sh / (1.0 - sh);
  float P = R + F;
  float tau = mod(T + (0.28 * r2 + 0.72 * g1) * P, P);
  float s = max(0.0, tau - R);                    // seconds since it left the silk
  float te = T - s;                          // when it left
  vec3 p3 = surf(L, u, v, te);
  float lum = shade(L, u, v, te, p3);
  vec2 q = p3.xy;
  float alpha;
  if (tau < R) {
    alpha = smoothstep(0.0, min(0.9, 0.5 * R), tau);   // re-forming on the sheet
  } else {
    // a steady wind up and to the left; the noise only ripples it, too weak and too slow to curl
    float spd = mix(0.9, 1.12, r3);
    const int N = 12;
    float dt = s / float(N);
    for (int i = 0; i < N; i++) {
      float si = (float(i) + 0.5) * dt;
      float ease = smoothstep(0.0, 2.2, si);
      vec2 vel = (u_wind + curl(q, te + si) * u_turb) * (ease * spd);
      vel.y -= 0.022 * (1.0 - ease);            // lifts off before the wind takes it
      q += vel * dt;
    }
    q += (vec2(r4, r5) - 0.5) * 0.010 * sqrt(s);
    alpha = exp(-s * mix(0.14, 0.34, r6)) * (1.0 - smoothstep(F * 0.62, F, s));
    lum *= 1.2 + 0.7 * smoothstep(0.0, 0.5, s) * exp(-s * 0.7);  // airborne grains catch the light as they lift
  }
  lum *= 1.0 - quiet(q);
  float k = (0.04 + lum) * (0.75 + 0.5 * rnd(id, 7u)) * alpha * u_gain;
  p = q; c = palette(lum) * k; sz = pickSize(rnd(id, 0u));
}
void silk(uint id, out vec2 p, out vec3 c, out float sz){ silkAt(id, u_time, p, c, sz); }`;

/* the intro: silky swirl -> the mark -> a gust -> the sheet. Pure functions of the intro clock. */
const INTRO = `
const float SW0 = 1.4;     // the swirl is already curling when it fades in
vec2 swirlVel(vec2 p, float t){
  vec2 d = p - vec2(0.5 * u_aspect, 0.52);
  vec2 vortex = vec2(-d.y, d.x) * 0.50 * exp(-dot(d, d) * 2.0);
  vec3 g = snoiseGrad(vec3(p * 1.5, t * 0.22 + 5.0));
  return vortex + vec2(g.y, -g.x) * 0.080 + vec2(-0.025, 0.0);
}
vec2 swirlPos(vec2 s, float t){
  vec2 p = s;
  float dt = t / 7.0;
  for (int i = 0; i < 7; i++) p += swirlVel(p, (float(i) + 0.5) * dt) * dt;
  return p;
}
float easeG(float s){ float e = s * s * s * (s * (s * 6.0 - 15.0) + 10.0); return e - 0.05 * sin(3.14159 * clamp(s / 0.3, 0.0, 1.0)) * (1.0 - s); }
// accretion: every grain has its own landing time; the hand fills first, then the word left to right
vec2 gatherPos(vec2 seed, float t, float r, out float e){
  vec2 C = a_i.xy;
  float dn = clamp(length(seed - C) / 1.1, 0.0, 1.0);
  float land = 0.64 + 0.20 * a_j.y + 0.28 * (0.55 * dn + 0.45 * r);
  float ts = max(land - (0.34 + 0.28 * dn), 0.28 + 0.06 * r);
  float s = clamp((t - ts) / (land - ts), 0.0, 1.0);
  e = easeG(s);
  if (s >= 1.0) return C;
  vec2 S = swirlPos(seed, t + SW0);
  if (s <= 0.0) return S;
  float ec = clamp(e, 0.0, 1.0);
  float pk = 6.75 * ec * (1.0 - ec) * (1.0 - ec);
  vec2 d = C - S;
  return mix(S, C, e) + vec2(-d.y, d.x) * (0.45 * pk * (r - 0.35));
}
// the gust: a strong leftward stream whose speed varies in thin horizontal bands (streamers),
// with eddies carried along in it (curls)
vec2 gustDisp(vec2 b, float a, float t0, float scale, float r){
  // each grain has its own speed inside fine horizontal bands: the mark smears into streamers
  float band = (0.60 + 0.80 * pow(0.5 + 0.5 * sin(b.y * 170.0 + 3.0 * sin(b.y * 23.0 + b.x * 4.0)), 2.0)) * (0.55 + 0.90 * r);
  vec2 p = b;
  float dt = a / 7.0;
  for (int i = 0; i < 7; i++) {
    float s = (float(i) + 0.5) * dt, t = t0 + s;
    vec2 q = p - vec2(-0.95, -0.22) * t;
    vec3 g = snoiseGrad(vec3(q * 1.7, t * 0.3 + 11.0));
    vec3 g2 = snoiseGrad(vec3(q * 4.3 + 3.7, t * 0.5 + 2.0));
    vec2 v = vec2(-1.10, -0.26) * band + (vec2(g.y, -g.x) + 0.35 * vec2(g2.y, -g2.x)) * 0.30;
    p += v * (scale * smoothstep(0.0, 0.55, s) * dt);
  }
  return p;
}
void introGrain(uint id, out vec2 p, out vec3 c, out float sz){
  uint sid = id * 3u + u_set;
  float q1 = rnd(sid, 11u), q2 = rnd(sid, 12u), q3 = rnd(sid, 13u), q4 = rnd(sid, 14u);
  float A = u_aspect, t = u_ti;
  vec2 seed = vec2(q1 * (A + 0.3) - 0.15, q2 * 1.3 - 0.15);
  float fade = smoothstep(0.0, 0.45, t - 0.22 * q3);
  // silky swirl: brightness follows thin stripes painted on the grains' starting positions; the flow
  // stretches and folds them into filaments
  float band0 = 0.5 + 0.5 * sin((seed.x * 0.55 + seed.y * 0.85) * 36.0 + 2.6 * sin(seed.x * 4.3 + seed.y * 2.9));
  float stripe = pow(band0, 6.0);
  float sl = 0.10 + 0.95 * stripe;
  vec3 swirlCol = palette(sl) * (0.03 + 0.55 * stripe) * u_gain;
  float gSize = pickSize(rnd(id, 0u));
  if (a_i.z >= 0.0) {
    // a grain of the mark
    // the gust peels the mark from its downwind (left) side, so the letters follow the hand off
    // rather than piling into it
    float td = u_tg + 0.30 * a_j.y + 0.05 * q4;
    float life = mix(0.70, 1.00, q3);
    float a = t - td;
    if (a >= life) {
      // gone on the wind; it re-forms at its place in the first scene (v6: the hand)
      if (u_itgt > 0.5) sceneAt(1, id, clk(1), p, c, sz); else silk(id, p, c, sz);
      c *= smoothstep(td + life, td + life + 0.22, t);
      return;
    }
    float e;
    vec2 b = gatherPos(seed, min(t, td), q3, e);
    float k = smoothstep(0.55, 1.0, e);
    vec3 lc = mix(vec3(0.93, 0.95, 0.90), vec3(0.36, 0.45, 0.75), a_i.w) * a_i.z * u_logoE;
    vec3 col = mix(swirlCol * mix(1.0, 1.6, smoothstep(0.0, 0.5, e)), lc, k);
    sz = gSize;
    if (a > 0.0) {
      b = gustDisp(b, a, td, 1.0, q2);
      float ag = a / life;
      col = mix(col, mix(vec3(0.80, 0.83, 0.90), vec3(0.95, 0.88, 0.72), q2) * u_logoE * 0.8, smoothstep(0.1, 0.6, ag)) * pow(1.0 - ag, 1.25);
      // the boost that makes the packed mark read solid goes as the grain leaves, so grains that
      // cross on the wind never add up to a clump brighter than the mark was
      col *= mix(1.0, min(1.0, 0.8 / u_logoE), smoothstep(0.0, 0.15, a));
      if (ag > 0.55) sz = u_px.x;
    }
    p = b; c = col * fade;
    return;
  }
  // everything else: swirls, dims to a faint dust while the mark holds, then the gust lays it onto the sheet
  float td = u_tg + 0.40 * (1.0 - clamp(seed.x / A, 0.0, 1.0)) + 0.10 * q4;
  // v6: the grains settle into the hand (the silk only if the hand was not ready), from the upwind side
  bool toHand = u_itgt > 0.5;
  vec2 sp; vec3 sc; float ss;
  if (toHand) sceneAt(1, id, clk(1), sp, sc, ss); else silk(id, sp, sc, ss);
  float order = toHand ? clamp(1.0 - sp.x / A, 0.0, 1.0) : a_g.x;  // the shape forms from its right end
  float fs = max(td + 0.04, u_tg + 0.12 + 0.50 * order);
  float w = smoothstep(fs, fs + 0.85, t);
  float dim = mix(1.0, 0.10, smoothstep(0.45, 1.10, t));
  vec2 b = swirlPos(seed, min(t, td) + SW0);
  if (t > td) b = gustDisp(b, t - td, td, 0.35, q2);
  vec3 col = swirlCol * dim * fade;
  if (w <= 0.0) { p = b; c = col; sz = gSize; return; }
  float ew = w * w * (3.0 - 2.0 * w);
  // home along the ribbon: the approach bends through a point a little upstream of the grain's place
  // (towards the ribbon's right end), so the sheet draws itself from the right instead of
  // condensing out of a haze; the grain stays faint dust until it is nearly there
  int L = int(a_g.z + 0.5);
  vec2 up = toHand ? vec2(0.932, 0.361) : -normalize(bezD(L, a_g.x));
  vec2 k1 = sp + up * (0.22 + 0.10 * q3);
  float m1 = 1.0 - ew;
  p = m1 * m1 * b + 2.0 * m1 * ew * k1 + ew * ew * sp;
  c = mix(col, sc, smoothstep(0.78, 1.0, w));
  sz = ew > 0.8 ? ss : gSize;
}
void main(){
  uint id = uint(gl_VertexID);
  vec2 p; vec3 c; float sz;
  if (u_intro > 0.5) introGrain(id, p, c, sz);
  else heroGrain(id, p, c, sz);      // v5: the loop
  c *= cardMask(p);
  if (max(c.r, max(c.g, c.b)) < 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; v_col = vec3(0.0); return; }
  gl_Position = toClip(p);
  gl_PointSize = sz;
  v_col = c;
}`;


/* ==================================================================== the dunes (v4), GLSL
 * BAKE_FS: the dune field, raymarched once into a small lit image (see stippleDunes).
 * DUNE: a grain at rest on the dunes. DRIFT: the sand the wind takes off the crests. */
const BAKE_FS = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform vec3  u_camPos;
uniform mat3  u_camRot;
uniform float u_tanHalf, u_aspect;
uniform vec3  u_sun;
uniform vec3  u_shape;        // amplitude, wavelength, how much bigger the dunes on the left are
uniform float u_fog;
uniform vec3  u_side;         // the big dunes: centre (x/z of the view), spread, floor on the far left
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// The wind blows to the left and a little towards the viewer, so the slip faces (steep, downwind)
// face the viewer's left, where the light is low: they catch it, and the windward backs fall into shade.
const vec2 WD = vec2(-0.9435, -0.3313);   // downwind, in xz
const vec2 CD = vec2(0.3313, -0.9435);    // along the crests
const float K = 0.78;                     // the brink's place within one dune wavelength
float prof(float q){
  if (q < K) { float u = q / K; return pow(0.5 - 0.5 * cos(3.14159265 * u), 1.15); }   // windward: a rounded back
  return pow(1.0 - (q - K) / (1.0 - K), 1.2);                                         // slip face
}
float field(vec2 p, out float q, out float amp){
  float s = dot(p, WD), t = dot(p, CD);
  float warp = 0.30 * sin(t * 0.045 + 1.3) + 0.16 * sin(t * 0.12 + 0.4) + 0.55 * (fbm(p * 0.012) - 0.44);
  q = fract(s / u_shape.y + warp);
  amp = u_shape.x * (0.45 + 0.95 * fbm(p * 0.018 + 3.1));
  // bigger dunes on the left of the view, smaller and calmer on the right (under the copy)
  float side = p.x / max(p.y, 8.0);
  float big = exp(-pow((side - u_side.x) / u_side.y, 2.0));
  amp *= 1.0 + u_shape.z * max(big, u_side.z * smoothstep(-0.05, -0.5, side)) - 0.25 * smoothstep(0.05, 0.4, side);
  float h = amp * prof(q);
  float q2 = fract(dot(p, vec2(-0.97, -0.24)) / 8.5 + 0.3 * sin(dot(p, vec2(-0.24, 0.97)) * 0.2) + 0.25 * fbm(p * 0.05));
  h += 0.30 * prof(q2) * (0.35 + 0.65 * (1.0 - prof(q)));
  return h;
}
float hgt(vec2 p){ float q, a; return field(p, q, a); }
void main(){
  vec2 ndc = gl_FragCoord.xy / u_res * 2.0 - 1.0;
  vec3 rd = normalize(u_camRot * vec3(ndc.x * u_tanHalf * u_aspect, ndc.y * u_tanHalf, 1.0));
  vec3 ro = u_camPos;
  float t = 1.0, lt = 1.0, q, amp;
  bool hit = false;
  for (int i = 0; i < 320; i++) {
    vec3 p = ro + rd * t;
    float dh = p.y - field(p.xz, q, amp);
    if (dh < 0.0) { hit = true; break; }
    lt = t;
    t += max(0.006 * t, dh * 0.3);
    if (t > 1400.0) break;
  }
  if (!hit) { o = rd.y < 0.0 ? vec4(0.0, 0.5, 0.0, 0.1) : vec4(0.0); return; }   // grazing rays that run out: far, fully hazed ground
  float a = lt, b = t;
  for (int i = 0; i < 7; i++) { float m = 0.5 * (a + b); vec3 p = ro + rd * m; if (p.y - field(p.xz, q, amp) < 0.0) b = m; else a = m; }
  t = b;
  vec3 p = ro + rd * t;
  field(p.xz, q, amp);
  float e = max(0.03, 0.0012 * t);
  vec3 n = normalize(vec3(hgt(p.xz - vec2(e, 0)) - hgt(p.xz + vec2(e, 0)), 2.0 * e, hgt(p.xz - vec2(0, e)) - hgt(p.xz + vec2(0, e))));
  // soft shadow towards the low light (dunes shade the ones behind them)
  float sh = 1.0, ts = 0.4;
  for (int i = 0; i < 40; i++) {
    vec3 sp = p + n * 0.05 + u_sun * ts;
    float d = sp.y - hgt(sp.xz);
    sh = min(sh, 10.0 * d / ts);
    ts += clamp(d * 0.6, 0.3, 6.0);
    if (sh < 0.0 || ts > 160.0) break;
  }
  sh = smoothstep(0.0, 1.0, sh);
  float back = pow(max(dot(rd, u_sun), 0.0), 6.0);                   // looking towards the glow
  float sunH = exp(-pow(atan(rd.x, rd.z) - atan(u_sun.x, u_sun.z), 2.0) / 0.8);
  float ndl = dot(n, u_sun);
  float lit = smoothstep(0.0, 0.22, ndl) * sh;                        // slip faces turned to the light
  float db = (q < K ? (K - q) : (q - K)) * u_shape.y;                 // distance to the brink along the wind
  float crest = exp(-db / (q < K ? 0.6 : 0.2)) * smoothstep(0.8, 2.2, amp);
  float graze = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 5.0);
  float rip = pow(0.5 + 0.5 * sin(dot(p.xz, WD) * 17.0 + 2.2 * sin(dot(p.xz, CD) * 0.8) + 3.0 * vnoise(p.xz * 0.6)), 2.0);
  rip *= 1.0 - smoothstep(14.0, 80.0, t);
  float sky = 0.5 + 0.5 * n.y;
  float direct = pow(max(ndl, 0.0), 0.6) * lit;
  float L = direct * (0.05 + 0.50 * sunH) * (0.68 + 0.32 * rip)
          + crest * (0.05 + 0.5 * sunH + 0.9 * back) * (0.4 + 0.6 * sh)
          + graze * back * 0.5
          + (1.0 - lit) * (0.004 * sky + 0.016 * rip * (0.15 + 0.85 * sunH))
          + 0.002;
  float fog = 1.0 - exp(-max(t - 18.0, 0.0) * u_fog);
  L *= 1.0 - fog * 0.93;
  float tint = clamp(0.06 + 0.75 * lit * (0.5 + 0.5 * sunH) + 0.7 * crest * (0.4 + 0.6 * sunH) + 0.2 * rip * (1.0 - lit), 0.0, 1.0);
  tint = mix(tint, 0.5, fog * 0.5);
  o = vec4(sqrt(clamp(L / ${DUNE_LMAX.toFixed(1)}, 0.0, 1.0)), tint, crest * (1.0 - fog), 0.1 + 0.9 * (1.0 - fog));
}`;


/* the loop's scenes on the GPU (v5). Every grain is a pure function of time in each scene; a change
   carries it from its place in one scene to its place in the next on a gust. */
const SCENES_GLSL = `
layout(location=3) in vec4 a_h;   // the hand: x, y (scene units), normal x, y
layout(location=4) in vec4 a_k;   //           occlusion and pool of light, energy per grain, share of time in the air (0: stays), flags (see matchScenes)
layout(location=5) in vec4 a_d;   // the dunes: x, y (scene units), energy, tint (0 shade .. 1 lit crest)
layout(location=6) in vec4 a_e;   //            crest, nearness (1 near .. 0 far), random, share of time in the air (0: stays)
uniform vec4  u_loop;     // scene now (0 silk, 1 hand, 2 dunes), scene next (<0: holding), seconds into the change, the change's length (s)
uniform vec4  u_tr;       // the gust front's start and its sweep across the card, right to left; when the new scene
                          // starts to settle, on its left, and how long it takes to fill in to the right (s, on the
                          // change's 3.5 s clock)
uniform vec4  u_tw;       // the change's wind (x, y: unit length); how far sand that goes round travels to come back in
                          // (scene units); how far downwind it turns back (past the card's downwind corner)
uniform vec3  u_clk;      // each scene's own clock (s): silk, hand, dunes
uniform vec4  u_hl;       // the hand's light: azimuth, elevation; the quiet feather round the copy (scene units); brightness
uniform vec4  u_hand;     // the hand's wrist (the pivot of its sway), how far it sways (radians), 0
uniform vec4  u_hw;       // the wind off the hand (x, y), 0, 0
uniform vec4  u_dw;       // the crest wind off the dunes (x, y), 0, 0
uniform float u_dgain;    // the dunes' brightness
float clk(int k){ return k == 0 ? u_clk.x : (k == 1 ? u_clk.y : u_clk.z); }

/* ---- the hand */
// it breathes: a slow sway about the wrist and a touch of swell
vec2 handHome(vec2 h, float T){
  float a = u_hand.z * (sin(0.23 * T + 0.4) + 0.4 * sin(0.61 * T + 1.9));
  float s = 1.0 + 0.006 * sin(0.37 * T + 0.8);
  vec2 d = h - u_hand.xy;
  float ca = cos(a), sa = sin(a);
  return u_hand.xy + vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y) * s;
}
// a low light from the upper left that drifts a little, so the fingers seem to turn in it: the planes
// turned to it catch it, a sheen runs along them, their lit edges catch a rim, and the far side falls
// away to near black
float handLight(float T){
  vec3 n = vec3(a_h.zw, sqrt(max(0.02, 1.0 - dot(a_h.zw, a_h.zw))));
  float az = u_hl.x + 0.13 * sin(T * 0.11) + 0.05 * sin(T * 0.27 + 1.0);
  float el = u_hl.y + 0.05 * sin(T * 0.17 + 2.0);
  vec3 L = vec3(cos(az) * cos(el), sin(az) * cos(el), sin(el));
  float d = max(0.0, (dot(n, L) + 0.08) / 1.08);
  float sp = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 36.0);
  float rim = pow(1.0 - n.z, 2.0) * max(0.0, dot(n.xy, L.xy) / (length(n.xy) * length(L.xy) + 1e-5));
  return (1.1 * pow(d, 1.8) + 0.9 * sp + 0.35 * rim + 0.010) * a_k.x;
}
void handAt(uint id, float T, out vec2 p, out vec3 c, out float sz){
  vec2 q = handHome(a_h.xy, T);
  float lum = handLight(T), k = a_k.y, alpha = 1.0;
  sz = pickSize(rnd(id, 0u));
  float e = a_k.z;
  if (e > 0.0) {
    // a blower, in the silk's style: patches of skin let go together, then each grain rides its own
    // lane straight down a steady wind, barely rippled, so the sand is combed into streamers
    float g1 = 0.5 + 0.5 * sin(a_h.y * 34.0 + 2.0 * sin(a_h.x * 6.0 + a_h.y * 3.0));
    float g2 = 0.5 + 0.5 * sin(a_h.x * 9.0 - a_h.y * 5.0 + 1.3);
    float P = mix(4.8, 7.2, g2);
    float F = P * e * mix(0.85, 1.0, rnd(id, 1u));
    float tau = mod(T + (0.75 * g1 + 0.25 * rnd(id, 2u)) * P, P);
    float s = tau - (P - F);
    if (s <= 0.0) alpha = smoothstep(0.0, 0.8, tau);
    else {
      q = handHome(a_h.xy, T - s);
      float spd = mix(0.80, 1.20, rnd(id, 3u));
      float se = s - 0.45 * (1.0 - exp(-s / 0.45));                 // eases into the wind
      float lane = rnd(id, 4u) * rnd(id, 4u) * 0.022;
      q += u_hw.xy * (spd * se);
      q.y -= lane * (1.0 - exp(-s / 0.35));
      q.y += 0.004 * sin(q.x * 9.0 + 0.6 * T + lane * 300.0) * min(s, 1.0);
      alpha = smoothstep(0.0, 0.25, s) * exp(-s * 0.20) * (1.0 - smoothstep(F * 0.7, F, s));
      lum = lum * (1.4 + 0.8 * exp(-s * 0.8)) + 0.12 * exp(-s * 0.6);   // airborne grains catch the light
      k = max(k, 0.8);
      if (s > 1.0) sz = u_px.x;
    }
  }
  lum *= 1.0 - quietF(q, u_hl.z);
  p = q;
  // the silk's spread of brightness from grain to grain, and a few glints where the light falls
  float spark = 0.72 + 0.56 * rnd(id, 7u) + 1.4 * step(0.955, rnd(id, 8u)) * smoothstep(0.25, 0.8, lum);
  c = palette(min(lum, 1.1)) * ((0.02 + lum) * k * alpha * spark * u_gain * u_hl.w);
}

/* ---- the dunes (the v4 dunes, now one scene of the loop) */
// deep sapphire in the shade, through moss, to mint and near white where the light catches (never cream)
vec3 dunePalette(float m){
  vec3 c0 = vec3(0.024, 0.040, 0.105);
  vec3 c1 = vec3(0.158, 0.213, 0.406);
  vec3 c2 = vec3(0.729, 0.786, 0.950);
  return m < 0.5 ? mix(c0, c1, m * 2.0) : mix(c1, c2, m * 2.0 - 1.0);
}
// the light a grain carries, at rest: a faint glitter and a slow ripple of light creeping downwind
float duneGlow(vec2 p, float t, float r){
  float creep = 0.5 + 0.5 * sin(p.x * 38.0 + p.y * 9.0 + 1.3 * t + 3.0 * sin(p.x * 3.1 + p.y * 7.0));
  return (0.90 + 0.10 * sin(t * (0.5 + r) + r * 60.0)) * (0.92 + 0.16 * creep * a_e.x);
}
void duneAt(uint id, float T, out vec2 p, out vec3 c, out float sz){
  vec2 home = a_d.xy;
  float e = a_e.w, near = a_e.y, k = a_d.z, m = a_d.w;
  if (e <= 0.0) {
    p = home;
    c = dunePalette(m) * (k * u_dgain * u_gain * duneGlow(home, T, a_e.z) * (1.0 - min(1.0, 1.12 * quiet(home))));   // (the lit slip faces are the brightest thing behind the copy: calmed a touch more)
    sz = near < 0.35 ? u_px.x : pickSize(rnd(id, 0u));
    return;
  }
  // sand the wind takes off the crests, in the silk's fine laminar style: each blower rides its own
  // lane straight down the wind; stretches of crest let go together in puffs, and a gust rolls along
  // the crests to the left
  float r1 = rnd(id, 1u), r2 = rnd(id, 2u), r3 = rnd(id, 3u), r4 = rnd(id, 4u);
  float X = home.x / u_aspect;
  float g1 = 0.5 + 0.5 * sin(X * 23.0 + 2.0 * sin(X * 5.0 + home.y * 7.0));
  float g2 = 0.5 + 0.5 * sin(X * 9.0 - home.y * 4.0 + 1.3);
  float P = mix(5.0, 7.5, g2);
  float F = P * e * mix(0.85, 1.0, r1);
  float tau = mod(T + (0.80 * g1 + 0.20 * r2) * P, P);
  float s = tau - (P - F), te = T - max(s, 0.0);
  vec2 q = home;
  float alpha;
  if (s <= 0.0) {
    alpha = smoothstep(0.0, 0.8, tau);
    k *= duneGlow(home, T, a_e.z);
  } else {
    float gust = pow(0.5 + 0.5 * sin(0.7 * te + 2.2 * X), 3.0);
    float spd = mix(0.80, 1.20, r3) * (0.55 + 0.45 * near) * (0.85 + 0.45 * gust);
    float se = s - 0.45 * (1.0 - exp(-s / 0.45));
    float lane = r4 * r4 * (0.006 + 0.022 * near);
    q += u_dw.xy * (spd * se);
    q.y -= lane * (1.0 - exp(-s / 0.35));
    q.y += 0.004 * sin(q.x * 9.0 + 0.6 * T + lane * 300.0) * min(s, 1.0);
    alpha = smoothstep(0.0, 0.25, s) * exp(-s * 0.22) * (1.0 - smoothstep(F * 0.7, F, s));
    k *= (1.5 + 1.2 * gust) * (1.0 + 0.6 * exp(-s * 0.8));
    m = max(m, 0.82);
  }
  p = q;
  c = dunePalette(m) * (k * u_dgain * u_gain * alpha * (1.0 - min(1.0, 1.12 * quiet(q))));
  sz = s > 1.0 ? u_px.x : pickSize(rnd(id, 0u));
}

/* ---- the loop */
void sceneAt(int k, uint id, float T, out vec2 p, out vec3 c, out float sz){
  if (k == 0) silkAt(id, T, p, c, sz);
  else if (k == 1) handAt(id, T, p, c, sz);
  else duneAt(id, T, p, c, sz);
}
// a grain's resting place in a scene, cheaply (it only times the change)
vec2 restXY(int k){
  if (k == 0) return surf(int(a_g.z + 0.5), a_g.x, a_g.y, u_clk.x).xy;
  return k == 1 ? a_h.xy : a_d.xy;
}
// when the gust front reaches x: it comes in from the right (upwind) and sweeps across to the left
float frontAt(float x){ return u_tr.x + u_tr.y * (1.0 - clamp(x / u_aspect, -0.2, 1.2)); }
// when the new scene settles at x: it fills in from its downwind (left) end, as the sand arrives
float landAt(float x){ return u_tr.z + u_tr.w * clamp(x / u_aspect, 0.0, 1.0); }
// whether the grain goes round in the change from scene a to scene b (see matchScenes)
bool goesRound(int a, int b){
  if (a == 2 && b == 1) return false;   // v6: dunes -> hand; sand already downwind of its place goes round in flight
  int f = int(a_k.w + 0.5), bit = (a == 1 && b == 0) ? 3 : a;
  return ((f >> bit) & 1) == 1;
}
/* A change. The gust lifts each grain from its place in scene A and the wind carries it to its place
   in scene B, always downwind: along its lane, leaving along the wind and coming in along the wind.
   Each grain leaves as the gust front passes it (the front is quick, so the scene is swept up nearly
   whole rather than eaten away). The new scene settles from its downwind (left) end to its upwind end,
   evenly, so it never forms in blocks, and a grain lands when its place's turn comes (or, if it has
   further to go, as soon as it gets there). A grain whose new place is upwind goes round (see matchScenes): on over the card's
   downwind edge (in page mode, past the stream's start) and back in on the gust from upwind, at a
   little less brightness, to the new scene's upwind end. No grain fades where it stands, and nothing
   is ever seen moving against the wind. Colour and size go from the one scene's to the other's; in the
   air grains catch the light. The change's times are on a 3.5 s clock, stretched to its length. */
void heroGrain(uint id, out vec2 p, out vec3 c, out float sz){
  int A = int(u_loop.x + 0.5);
  if (u_loop.y < -0.5) { sceneAt(A, id, clk(A), p, c, sz); return; }
  int B = int(u_loop.y + 0.5);
  float sc = u_loop.w / 3.5;                  // the change runs on a 3.5 s clock, stretched to its length
  float t = u_loop.z / sc;
  float r1 = rnd(id, 21u), r2 = rnd(id, 22u), r3 = rnd(id, 23u), r4 = rnd(id, 24u);
  vec2 W = u_tw.xy, hA = restXY(A), hB = restXY(B);
  bool round = goesRound(A, B);
  // (sand that goes round has further to fly: it lifts a little ahead of the front, and flies faster)
  float tl = round ? 0.65 * frontAt(hA.x) + 0.35 * r1 : frontAt(hA.x) + 0.40 * r1;
  float dist = round ? length(hB + W * u_tw.z - hA) : length(hB - hA);
  float tb = min(max(tl + 0.45 + dist / (round ? 3.0 : 2.0), landAt(hB.x) + 0.3 * r3), 3.46);
  // one scene's grain: A's before it leaves (in the air, A's as it was when it left), B's once landed
  bool fly = t >= tl && t < tb;
  sceneAt(t < tb ? A : B, id, t < tl ? clk(A) : (fly ? clk(A) - (t - tl) * sc : clk(B)), p, c, sz);
  if (!fly) return;
  // in the air: where it will land (B's place when it lands)
  vec2 pA = p, pB; vec3 cA = c, cB; float zA = sz, zB;
  sceneAt(B, id, clk(B) + (tb - t) * sc, pB, cB, zB);
  round = round || dot(pB - pA, W) < -0.02;   // sand already in the air, downwind of its new place, goes round too
  vec2 pT = round ? pB + W * u_tw.z : pB;
  float s = clamp((t - tl) / max(tb - tl, 0.05), 0.0, 1.0);
  float sq = pow(s, 0.75);
  float e = sq * sq * (3.0 - 2.0 * sq);                            // leaves briskly, settles gently
  float reach = 0.28 * length(pT - pA) + 0.03 + 0.04 * r4;
  vec2 P1 = pA + W * reach + vec2(0.0, -0.02 - 0.03 * r2);        // lifts and goes with the wind
  vec2 P2 = pT - W * (0.8 * reach);                               // comes in on the wind to land
  float m = 1.0 - e;
  vec2 q = m * m * m * pA + 3.0 * m * m * e * P1 + 3.0 * m * e * e * P2 + e * e * e * pT;
  float air = sin(3.14159 * s);
  // lanes across the wind, fixed in space: far from both its places the sand is combed into streamers
  // (the bright lanes run a little ahead); near either place it is not, so nothing forms or leaves in stripes
  vec2 Wp = vec2(-W.y, W.x);
  float cw = dot(q, Wp) + 0.004 * sin(0.3 * u_time);
  // (two unrelated spacings, so the lanes never read as a regular comb)
  float lane = 0.6 * pow(0.5 + 0.5 * sin(cw * 150.0 + 3.0 * sin(cw * 23.0 + 1.7)), 2.0) + 0.4 * pow(0.5 + 0.5 * sin(cw * 97.0 + 1.1 + 2.0 * sin(cw * 41.0)), 3.0);
  float far = smoothstep(0.03, 0.12, min(distance(q, pA), distance(q, pT)));
  q += W * ((0.07 * (lane - 0.35) + 0.05 * (r4 - 0.5)) * air * far);
  q += Wp * (0.003 * sin(dot(q, W) * 9.0 + 0.6 * u_time + r3 * 40.0) * air);   // a faint, slow ripple in its lane
  float back = 1.0;
  if (round && dot(q, W) > u_tw.w) { q -= W * u_tw.z; back = 0.85; }   // past the downwind edge: back in from upwind
  vec3 col = mix(cA, cB, smoothstep(0.30, 0.80, s)) * mix(1.0, 0.6 + 1.0 * lane, far) * back * (1.0 + 0.4 * air);
  p = q;
  c = col * (1.0 - quiet(q) * air);
  sz = air > 0.5 ? u_px.x : (s < 0.5 ? zA : zB);
}
`;

/* page mode: the sand that blows off the ribbon's left end, turns and falls out of the card, and
   spirals down the page. The grains need no buffer: each one's place on the path and across the band
   comes from its vertex id. */
const STREAM_VS = `
uniform float u_n;        // grains in the stream
uniform float u_sh;       // how far every grain has advanced along the path (0..1, wraps)
uniform float u_view;     // doc y of the canvas's top edge, CSS px (the canvas covers u_view .. u_view + u_vp.y)
uniform float u_frac;     // adaptive share of grains drawn
uniform float u_amt;      // 0..1: the stream fades in once the intro has settled
uniform vec4  u_len;      // lead-in length, total length, where the helix starts (doc y), where the path ends (doc y)
uniform vec4  u_LPA[${LEAD_N / 2}]; // the lead-in, doc px, at equal steps along it (two points to a vec4): from where
uniform vec4  u_LPB[${LEAD_N / 2}]; // the scene's blown sand leaves it (the silk's frayed left end, the hand's thumb and
                               // first finger, the dunes' left crests), with its wind, turning down the card's left
                               // margin, into the helix. A: the scene now, B: the next (v5)
uniform vec4  u_lead;     // v5: how far B's lead-in shows (0..1); where the lead-in starts to show (px along it);
                          // its brightness; 0
uniform float u_warp[${WARP_N + 1}]; // round one turn: share of the turn's length -> share of its height
uniform vec4  u_hx;       // helix radius, pitch (px per turn), band half-width, tilt
uniform vec4  u_ax;       // the axis: centre x, sway (px), sway phase; length of one turn (px)
uniform vec4  u_look;     // back of each turn: light, width; the quiet feather (px); the feather in the lead-in (px)
uniform vec4  u_grow;     // band width at the lead-in's start (share), grows to full between these two
                          // lengths along the path (px); fade-in length (px)
uniform vec4  u_Q[${MAX_QRECTS}];   // content blocks near the viewport, canvas CSS px: x0 y0 x1 y1
uniform float u_Qs[${MAX_QRECTS}];
uniform int   u_Qn;
// point j of the lead-in, between the scene now's and the next's (they have the same length, so a
// grain keeps its place along it)
vec2 lp(int j){
  vec4 a = u_LPA[j >> 1], b = u_LPB[j >> 1];
  return (j & 1) == 0 ? mix(a.xy, b.xy, u_lead.x) : mix(a.zw, b.zw, u_lead.x);
}
vec2 leadIn(float s){
  // Catmull-Rom through points spaced evenly along the lead-in, so grains keep an even spacing
  float f = clamp(s / u_len.x, 0.0, 1.0) * float(${LEAD_N - 1});
  int i = min(int(f), ${LEAD_N - 2});
  float t = f - float(i);
  vec2 p0 = lp(max(i - 1, 0)), p1 = lp(i), p2 = lp(i + 1), p3 = lp(min(i + 2, ${LEAD_N - 1}));
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t3);
}
// a helix around a slowly wandering vertical axis, seen from above at a slant: x, y (doc px), depth
// (-1 at the back of a turn, 1 at the front). y is the axis height; it starts at the left of a turn.
vec3 helix(float y){
  float yy = y - u_len.z;
  float ramp = smoothstep(0.0, u_hx.y, yy);
  float th = 3.14159265 - TAU * yy / u_hx.y + 0.35 * ramp * sin(0.08 * u_time + y / 1900.0);
  float ax = u_ax.x + u_ax.y * (sin(TAU * y / 3700.0 + u_ax.z) + 0.4 * sin(TAU * y / 1700.0 + 2.3 + u_ax.z));
  float R = u_hx.x * (1.0 + 0.10 * sin(TAU * y / 2900.0 + 0.4));
  float z = sin(th);
  return vec3(ax + R * cos(th) * (1.0 + 0.10 * z), y + u_hx.w * R * z, z);
}
// px along the helix -> axis height, so the grains are spaced evenly along the band, not along the axis
float helixY(float sh){
  float q = sh / u_ax.w;
  float n = floor(q), f = (q - n) * float(${WARP_N});
  int i = min(int(f), ${WARP_N - 1});
  float w = mix(u_warp[i], u_warp[i + 1], f - float(i));
  return u_len.z + (n + w) * u_hx.y;
}
vec3 pathAt(float s){
  if (s < u_len.x) { float b = s / u_len.x; return vec3(leadIn(s), 0.5 * (1.0 - b)); }
  return helix(helixY(s - u_len.x));
}
float quietPx(vec2 p, float f){
  float q = 0.0;
  for (int i = 0; i < ${MAX_QRECTS}; i++) {
    if (i >= u_Qn) break;
    vec4 r = u_Q[i];
    float qx = smoothstep(r.x - f, r.x, p.x) * (1.0 - smoothstep(r.z, r.z + f, p.x));
    float qy = smoothstep(r.y - f, r.y, p.y) * (1.0 - smoothstep(r.w, r.w + f, p.y));
    q = max(q, qx * qy * u_Qs[i]);
  }
  return q;
}
void cull(){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; v_col = vec3(0.0); }
void main(){
  uint id = uint(gl_VertexID);
  if (rnd(id, 9u) > u_frac) { cull(); return; }
  float r0 = rnd(id, 1u), r3 = rnd(id, 3u), r4 = rnd(id, 4u);
  float s = fract((float(id) + r0) / u_n + u_sh) * u_len.y;   // px along the path
  float m = u_hx.w * u_hx.x * 1.12 + u_hx.z * 2.4 + 12.0;   // how far a grain can sit from its axis height
  float yAx = 0.0;
  if (s >= u_len.x) {                                    // cheap cull before any real work
    yAx = helixY(s - u_len.x);
    if (yAx < u_view - m || yAx > u_view + u_vp.y + m) { cull(); return; }
  }
  bool dust = rnd(id, 2u) < 0.08;
  vec3 c0 = s >= u_len.x ? helix(yAx) : pathAt(s);
  vec3 c1 = pathAt(s + 3.0);
  vec2 tg = normalize(c1.xy - c0.xy + vec2(1e-4, 0.0));
  vec2 nrm = vec2(-tg.y, tg.x);
  float z = c0.z;
  float zf = 0.5 + 0.5 * z;
  // the band: already wide inside the ribbon, then full width, narrower at the back of each turn,
  // twisting slowly as it goes. Grains crowd a little into fine lanes along its length.
  float grow = mix(u_grow.x, 1.0, smoothstep(u_grow.y, u_grow.z, s));
  float tw = 0.55 + 0.45 * abs(cos(s / 1400.0 * 3.14159 + 0.6 + 0.3 * sin(0.05 * u_time)));
  float v = r3 * 2.0 - 1.0;
  v += 0.022 * sin(v * 19.0 + 3.0 * sin(v * 4.7 + 1.3));
  if (dust) v = (r3 < 0.5 ? -1.0 : 1.0) * (1.1 + 1.1 * pow(r4, 1.6)) + 0.25 * sin(0.4 * u_time + r4 * 40.0);
  vec2 pos = c0.xy + nrm * (v * u_hx.z * grow * tw * mix(u_look.y, 1.0, zf));
  vec2 pv = pos - vec2(0.0, u_view);
  if (pv.y < -8.0 || pv.y > u_vp.y + 8.0 || pv.x < -8.0 || pv.x > u_vp.x + 8.0) { cull(); return; }
  // light: fine combed lanes that run the band's whole length (so it reads laminar), brighter at
  // the front of each turn, soft edges, gentle pulses that travel with the grains
  float lanes = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(v * 19.0 + 3.0 * sin(v * 4.7 + 1.3)), 2.0);
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(v));
  float light = mix(u_look.x, 1.0, zf);
  float pulse = 0.66 + 0.34 * sin(s / 170.0 + v * 1.7);
  float lum = dust ? 0.14 + 0.20 * r4 : 0.66 * lanes * edge * pulse;
  lum *= light * (0.45 + 0.55 * tw);
  float fade = smoothstep(u_lead.y, u_lead.y + u_grow.w, s) * (1.0 - smoothstep(u_len.w - 600.0, u_len.w, pos.y)) * u_amt;
  // in the card the lead-in keeps to the margin beside the copy on a desktop: a hard edge there, not a
  // feather. On a phone it runs behind the copy and thins out as it reaches it
  float qf = mix(u_look.w, u_look.z, smoothstep(u_len.x - 120.0, u_len.x + 160.0, s));
  // the quiet zones dim a grain once, and linearly, keeping its colour: behind a block of strength s
  // it keeps 1 - s of its light, so the host's strengths mean what they say
  float q = 1.0 - quietPx(pv, qf);
  lum *= fade;
  float k = (0.03 + lum) * (0.75 + 0.5 * rnd(id, 7u)) * u_gain * u_lead.z * fade * q;
  if (k < 0.003) { cull(); return; }
  gl_Position = vec4(pv.x / u_vp.x * 2.0 - 1.0, 1.0 - pv.y / u_vp.y * 2.0, 0.0, 1.0);
  gl_PointSize = (dust || z < -0.3) ? u_px.x : pickSize(rnd(id, 0u));
  v_col = palette(lum) * k;
}`;

const FS_GRAIN = `#version 300 es
precision mediump float;
in vec3 v_col;
out vec4 o;
void main(){ o = vec4(v_col, 1.0); }`;

const VS_QUAD = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FS_DOWN = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_srcTexel;
uniform vec2 u_dstRes;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / u_dstRes;
  vec2 d = u_srcTexel;
  vec3 c = texture(u_src, uv + d * vec2(-1.0, -1.0)).rgb + texture(u_src, uv + d * vec2(1.0, -1.0)).rgb
         + texture(u_src, uv + d * vec2(-1.0, 1.0)).rgb + texture(u_src, uv + d * vec2(1.0, 1.0)).rgb;
  o = vec4(c * 0.25, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform vec2 u_res;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 c = texture(u_src, uv).rgb * 0.2270270270;
  c += texture(u_src, uv + u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_src, uv - u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_src, uv + u_dir * 3.2307692308).rgb * 0.0702702703;
  c += texture(u_src, uv - u_dir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

const FS_COMP = `#version 300 es
precision highp float;
uniform sampler2D u_grain;
uniform sampler2D u_bloom;
uniform vec2  u_res;
uniform float u_aspect;
uniform float u_time;
uniform float u_exposure;
uniform float u_bloomAmt;
uniform float u_film;
uniform vec4  u_quiet;
uniform float u_quietAmt;
uniform vec3  u_glow;
uniform float u_dpr;      // device px per CSS px
uniform vec4  u_xf;       // as the grains: the card's offset in canvas CSS px, px per scene unit
uniform vec2  u_hero;     // the card's size, CSS px
uniform vec3  u_page;     // page mode (0/1), card corner radius, card bottom fade (CSS px)
uniform vec3  u_pageBg;   // the page colour, linear
uniform float u_transparent; // Cue: render only the original grains, over the existing website
uniform sampler2D u_bake; // v5: the dune field's lit image (alpha: 0 sky, 0.1 far .. 1 near ground)
uniform vec4  u_body;     // v5: the dunes' bodies: how present, the horizon (scene y), seconds into a change (<0: none), +1 arriving / -1 leaving
uniform vec4  u_hglow;    // v5: the glow low on the horizon behind the dunes: x, y (scene units), width, strength
uniform vec4  u_tr;       // v5: the change's gust front and its settling (as the grains)
uniform float u_bakeA;    // v5: the aspect the dunes' image was made for (the card may have changed height since)
out vec4 o;
// the card's sky: its pool of light, and (with the dunes: d) a soft mint glow low on the horizon
// where the light comes from
vec3 skyAt(vec2 p, vec3 deep, vec3 lift, float d){
  vec2 g = (p - u_glow.xy) / u_glow.z;
  vec3 c = mix(deep, lift, exp(-dot(g, g)));
  vec2 hg = (p - u_hglow.xy) / vec2(u_hglow.z, u_hglow.z * 0.22);
  float r2 = dot(hg, hg);
  return c + (vec3(0.030, 0.042, 0.086) * 0.5 * exp(-r2 * 0.5) + vec3(0.51, 0.57, 0.77) * 0.10 * exp(-r2 * 2.6)) * u_hglow.w * d;
}
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 css = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
  vec2 hp = css - u_xf.xy;                         // CSS px within the card
  vec2 p = hp / u_xf.z;                            // scene units
  vec2 cuv = vec2(hp.x / u_hero.x, 1.0 - hp.y / u_hero.y);
  vec3 hdr = texelFetch(u_grain, ivec2(gl_FragCoord.xy), 0).rgb;
  vec3 bloom = texture(u_bloom, uv).rgb;
  vec3 deep = vec3(0.0017, 0.0027, 0.0056);
  vec3 lift = vec3(0.0073, 0.0108, 0.0240);
  vec3 bg = skyAt(p, deep, lift, u_body.x);
  // v5: the dunes' bodies in front of the sky: dark up close, dissolving with distance into the sky at
  // the horizon. In a change they come and go with the gust front, as their sand does
  if (u_body.x > 0.001) {
    vec4 bk = texture(u_bake, vec2(p.x / u_bakeA, 1.0 - p.y));   // the bake's rows run bottom up
    float terr = smoothstep(0.02, 0.1, bk.a) * step(0.0, p.y) * step(p.y, 1.0);
    if (terr > 0.0) {
      float fog = clamp((1.0 - bk.a) / 0.9, 0.0, 1.0);
      vec3 body = mix(vec3(0.0011, 0.0018, 0.0036), skyAt(vec2(p.x, u_body.y), deep, lift, u_body.x), pow(fog, 1.6));
      float land = 1.0;
      if (u_body.z >= 0.0) {
        // (on the change's 3.5 s clock, as the grains: they come in just ahead of their sand, and go as it goes)
        float X = clamp(p.x / u_bakeA, -0.2, 1.2), f = u_tr.x + u_tr.y * (1.0 - X), g = u_tr.z + u_tr.w * clamp(X, 0.0, 1.0);
        land = u_body.w > 0.0 ? smoothstep(g - 0.5, g + 0.5, u_body.z) : 1.0 - smoothstep(0.6 * f, f + 0.8, u_body.z);
      }
      bg = mix(bg, body, terr * u_body.x * land);
    }
  }
  float card = 1.0;
  if (u_page.x > 0.5) {
    // the card: a rounded box whose colour melts into the page over its last u_page.z px
    vec2 hh = u_hero * 0.5;
    vec2 d = abs(hp - hh) - hh + u_page.y;
    float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - u_page.y;
    card = (1.0 - smoothstep(-0.7, 0.7, sd)) * (1.0 - smoothstep(u_hero.y - u_page.z, u_hero.y, hp.y));
    bg = mix(u_pageBg, bg, card);
  }
  if (u_transparent > 0.5) bg = vec3(0.0);
  vec3 light = hdr + bloom * u_bloomAmt * vec3(0.79, 0.84, 0.99);
  vec3 mapped = 1.0 - exp(-light * u_exposure);
  vec3 col = bg + mapped * (1.0 - bg);
  const float f = 0.12;
  float qx = smoothstep(u_quiet.x - f, u_quiet.x + f, p.x) * (1.0 - smoothstep(u_quiet.z - f, u_quiet.z + f, p.x));
  float qy = smoothstep(u_quiet.y - f, u_quiet.y + f, p.y) * (1.0 - smoothstep(u_quiet.w - f, u_quiet.w + f, p.y));
  col *= 1.0 - 0.28 * qx * qy * u_quietAmt * card;
  vec2 q = (cuv - 0.5) * vec2(1.0, 1.15);
  col *= 1.0 - 3.6 * dot(q, q) * dot(q, q) * card;
  col = toSRGB(col);
  float fr = floor(u_time * 24.0);
  float n = hash(gl_FragCoord.xy + fr * 17.31) + hash(gl_FragCoord.xy * 1.37 + 91.7 + fr * 5.13) - 1.0;
  col += n * u_film * (0.55 + 0.45 * (1.0 - col.g)) * card;
  if (u_transparent > 0.5) {
    float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    o = vec4(col / max(a, 0.00001), a);
  } else {
    o = vec4(col, 1.0);
  }
}`;

/* ------------------------------------------------------------------ WebGL helpers */
function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log); }
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  const a = compile(gl, gl.VERTEX_SHADER, vs), b = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a); gl.attachShader(p, b);
  gl.linkProgram(p);
  return programFinish(gl, { p, a, b });
}
// v5: a program built in two steps, so that it can compile in parallel (KHR_parallel_shader_compile)
// while frames go on being drawn: start it, and finish it once it is done
function programStart(gl, vs, fs) {
  const p = gl.createProgram(), mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const a = mk(gl.VERTEX_SHADER, vs), b = mk(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a); gl.attachShader(p, b);
  gl.linkProgram(p);
  return { p, a, b };
}
function programFinish(gl, st) {
  const { p, a, b } = st;
  const ok = gl.getProgramParameter(p, gl.LINK_STATUS);
  const log = ok ? '' : (gl.getShaderInfoLog(a) || '') + (gl.getShaderInfoLog(b) || '') + (gl.getProgramInfoLog(p) || '');
  // the program keeps what it needs: the shader objects can go either way
  gl.detachShader(p, a); gl.detachShader(p, b); gl.deleteShader(a); gl.deleteShader(b);
  if (!ok) { gl.deleteProgram(p); throw new Error(log); }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

/* ------------------------------------------------------------------ the mark (intro) */
function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
function alphaBox(img) {
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
    if (d[(y * c.width + xx) * 4 + 3] > 12) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function fontReady(spec, ms) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.race([document.fonts.load(spec).catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
}

/* Lay out hand + wordmark centred, side by side, and sample it into grain targets. Returns Float32Array
   of [x, y, lum, mint, depth, sx] per grain (scene units). A phone used to stack the hand above the word;
   it is the desktop's lockup now (Tayyib, 28 Sep: "On mobile the startup should be the same as desktop",
   "it should be next to it"), sized to fit the width, with the hand a little bigger so its fingers read. */
function sampleMark(cssW, cssH, hand, font, word, dens, maxN, rand) {
  const mc = document.createElement('canvas');
  const mx = mc.getContext('2d', { willReadFrequently: true });
  const split = /Hand$/.test(word) && word.length > 4 ? word.length - 4 : word.length;
  const setF = (F) => { mx.font = `600 ${F}px ${font}`; if ('letterSpacing' in mx) mx.letterSpacing = (-0.03 * F).toFixed(2) + 'px'; };
  const textW = (F) => { setF(F); return mx.measureText(word).width; };
  const hAsp = hand.box.w / hand.box.h;
  const portrait = cssW < 640 && cssH > cssW;
  const handK = portrait ? 1.2 : 1;               // on a phone the hand is drawn a little bigger, so its fingers read
  // the lockup's width for a font size: every part scales with it (the letter spacing too)
  const lockupW = (F) => F * 1.5 * handK * hAsp + F * 0.36 + textW(F);
  let F = portrait ? Math.min(cssW * 0.14, 50) : Math.max(30, Math.min(cssW * 0.052, 78));
  const fit = cssW * (portrait ? 0.88 : 0.84);
  if (lockupW(F) > fit) F = Math.max(16, F * fit / lockupW(F));
  const tw = textW(F), handH = F * 1.5 * handK, handW = handH * hAsp, gap = F * 0.36;
  const L = { F, w: handW + gap + tw, h: handH, hand: { x: 0, y: 0, w: handW, h: handH }, text: { x: handW + gap, base: handH * 0.5 + F * 0.36 } };
  const cx = cssW / 2, cy = cssH * (L.h > L.w * 0.6 ? 0.46 : 0.5);
  const left = cx - L.w / 2, top = cy - L.h / 2;
  const k = 2;                                   // sample at 2 px per CSS px
  mc.width = Math.ceil(L.w * k) + 4; mc.height = Math.ceil(L.h * k) + 4;
  mx.setTransform(k, 0, 0, k, 2, 2);
  mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high';
  if (hand.img) {
    const b = hand.box;
    mx.drawImage(hand.img, b.x, b.y, b.w, b.h, L.hand.x, L.hand.y, L.hand.w, L.hand.h);
  } else {
    mx.save();
    mx.translate(L.hand.x, L.hand.y);
    mx.scale(L.hand.w / hand.box.w, L.hand.h / hand.box.h);
    mx.translate(-hand.box.x, -hand.box.y);
    mx.fillStyle = '#ffffff'; mx.fill(new Path2D(HAND_PATH));
    mx.restore();
  }
  setF(L.F);
  mx.textBaseline = 'alphabetic';
  mx.fillStyle = '#ffffff'; mx.fillText(word.slice(0, split), L.text.x, L.text.base);
  if (split < word.length) {
    const rw = mx.measureText(word.slice(0, split)).width;
    mx.fillStyle = '#9dbcff'; mx.fillText(word.slice(split), L.text.x + rw, L.text.base);
  }
  const W = mc.width, H = mc.height;
  const px = mx.getImageData(0, 0, W, H).data;
  let ink = 0;
  for (let i = 3; i < px.length; i += 4) ink += px[i];
  ink = ink / 255 / (k * k);                     // CSS px^2
  const d = Math.min(dens, maxN / Math.max(1, ink));
  const run = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = W - 1, r = 0; x >= 0; x--) { r = px[(y * W + x) * 4 + 3] >= 12 ? r + 1 : 0; run[y * W + x] = r; }
  const out = [];
  const handX0 = L.hand.x * k + 2, handR = (L.hand.x + L.hand.w) * k + 2, handB = (L.hand.y + L.hand.h) * k + 2;
  const fingersB = (L.hand.y + 0.56 * L.hand.h) * k + 2;   // the fingers: the top of the hand, above the palm's crease
  // the hand's luminance, darkest within a small radius: the thin darker lines between the fingers
  // (and the rim) grow by that radius, so they stay open at grain size
  const yAt = (x, y) => { const o = (y * W + x) * 4; return px[o + 3] < 30 ? 0 : (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255; };
  const rr = Math.max(1, Math.round(k * (portrait ? 1.4 : 1.1)));
  const minY = (x, y) => {
    let m = 1;
    for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) {
      if (i * i + j * j > rr * rr) continue;
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) { m = 0; continue; }
      m = Math.min(m, yAt(xx, yy));
    }
    return m;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, al = px[o + 3] / 255;
    if (al < 0.05) continue;
    let n = al * d / (k * k);
    const inHand = x >= handX0 - 2 && x < handR && y < handB;
    const r0 = px[o], g0 = px[o + 1], b0 = px[o + 2];
    let lum = 1, mint = 0;
    if (inHand) {
      const Y = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255;
      const face = Math.max(0, Math.min(1, (Y - 0.55) / 0.4));      // silver rim 0 .. white face 1
      const open = y < fingersB ? sstep(0.80, 0.90, minY(x, y)) : 1; // 0 on and beside the lines between the fingers
      if (open <= 0) continue;
      lum = (0.55 + 0.45 * face) * 0.88;
      n *= (0.6 + 0.4 * face) * open;
    } else if (g0 - r0 > 40) { mint = 1; }
    const cnt = Math.floor(n) + (rand() < n - Math.floor(n) ? 1 : 0);
    const depth = run[y * W + x] / k / cssH;
    for (let c = 0; c < cnt; c++) {
      const xc = left + (x - 2 + rand()) / k, yc = top + (y - 2 + rand()) / k;
      out.push(xc / cssH, yc / cssH, lum, mint, depth, Math.min(1, Math.max(0, (xc - left) / L.w)));
    }
  }
  const N = out.length / 6;
  const f = new Float32Array(out);
  // shuffle so the mark's grains are spread evenly over the sheet
  for (let a = N - 1; a > 0; a--) {
    const b = (rand() * (a + 1)) | 0;
    for (let c = 0; c < 6; c++) { const s = f[6 * a + c]; f[6 * a + c] = f[6 * b + c]; f[6 * b + c] = s; }
  }
  return { data: f, n: N, dens: d, layout: { left, top, w: L.w, h: L.h } };
}

/* ------------------------------------------------------------------ page mode: the stream */
// the helix without its slow time wobble, matching helix() in STREAM_VS
function helixJS(G, y) {
  const yy = y - G.y0;
  const th = Math.PI - TAU_JS * yy / G.pitch;
  const ax = G.axC + G.sway * (Math.sin(TAU_JS * y / 3700 + G.ph) + 0.4 * Math.sin(TAU_JS * y / 1700 + 2.3 + G.ph));
  const R = G.R * (1 + 0.10 * Math.sin(TAU_JS * y / 2900 + 0.4));
  const z = Math.sin(th);
  return [ax + R * Math.cos(th) * (1 + 0.10 * z), y + G.tilt * R * z];
}
function bez4(B, t) { const m = 1 - t, a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t; return [a * B[0][0] + b * B[1][0] + c * B[2][0] + d * B[3][0], a * B[0][1] + b * B[1][1] + c * B[2][1] + d * B[3][1]]; }
/* The stream's path for a layout, in document px.
   The lead-in starts inside the main ribbon's frayed left end, where its grains are already leaving
   on the wind, runs left with them, turns and falls down the card's left margin (on a phone, behind
   the copy), out of the card and into the helix, arriving at the left of a turn, heading down. The
   helix runs to the bottom of the document: one turn a little over a screen tall, seen from above
   at a slant, so each screen holds a bright front sweep and a dimmer back sweep.
   vh is the viewport's height, kept steady (a phone's toolbar does not move the path). */
function streamGeom(L, vh, src) {
  const vw = L.viewportW, h = L.hero, phone = vw < 700, K = phone ? STREAM.phone : STREAM.desk;
  // the projected helix is a trochoid: x = R cos(th), y = k th + a sin(th), with k = pitch / 2pi and
  // a = tilt * R. a/k (K.loop) near 1 draws sharp cusps, so it is kept well clear of 1: above 1.6 each
  // turn reads as a loop of a coil, below 0.7 as a smooth wave
  const G = { phone, K, R: vw * K.R, pitch: Math.max(600, vh * K.pitch), hw: K.hw, axC: vw * 0.5, sway: vw * K.sway, speed: K.speed };
  G.tilt = K.loop * (G.pitch / TAU_JS) / G.R;
  G.y0 = h.y + h.h + vh * (phone ? 0.10 : 0.16);
  // the axis's sway is at its leftmost where the helix starts, so the lead-in falls nearly straight into it
  G.ph = -Math.PI / 2 - TAU_JS * G.y0 / 3700;
  G.end = Math.max(G.y0 + 400, L.docH);
  // round one turn (constant radius, no sway): cumulative length -> height, so grains are spaced
  // evenly along the band (its sweeps across the page are about three times longer than its height)
  const M = 720, cum = new Float64Array(M + 1), a = G.tilt * G.R, kk = G.pitch / TAU_JS;
  let prev = [G.R * Math.cos(Math.PI), 0];
  for (let i = 1; i <= M; i++) {
    const th = Math.PI - TAU_JS * i / M, z = Math.sin(th);
    const p = [G.R * Math.cos(th) * (1 + 0.10 * z), kk * TAU_JS * i / M + a * z];
    cum[i] = cum[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
  }
  G.Lturn = cum[M];
  G.warp = new Float32Array(WARP_N + 1);
  for (let j = 0, i = 0; j <= WARP_N; j++) {
    const target = G.Lturn * j / WARP_N;
    while (i < M && cum[i + 1] < target) i++;
    const f = i < M ? (target - cum[i]) / Math.max(1e-9, cum[i + 1] - cum[i]) : 0;
    G.warp[j] = Math.min(1, (i + f) / M);
  }
  G.cum = cum; G.M = M;
  /* the lead-in, one for each scene of the loop (v5): from where that scene's blown sand leaves it,
     with its wind, to a joint in the card's left margin (on a phone, the top of the copy), then
     the same for all of them: down, out of the card and into the helix. The shorter starts are carried
     back upwind, unseen (the stream fades in from pre), so all of them have the same length and a
     grain keeps its place along the lead-in as the scenes change. src: the hand's and the dunes'
     starts (scene units), when they are laid out */
  const A = h.w / h.h, Ly = silkLayers(A)[0];
  const doc = (c) => [h.x + c[0] * h.h, h.y + c[1] * h.h];
  const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const t0 = bezDJS(Ly.P, phone ? 0.74 : 0.70);
  const starts = [{ p: doc(bezJS(Ly.P, phone ? 0.74 : 0.70)), d: unit([t0[0], t0[1] + 0.12 * Math.hypot(t0[0], t0[1])]) }];   // along the ribbon, leftwards, dipping a little
  starts.push(src && src.hand ? { p: doc(src.hand), d: unit(HAND_WIND) } : starts[0]);
  starts.push(src && src.dunes ? { p: doc(src.dunes), d: unit(DUNE_WIND) } : starts[0]);
  const H0 = helixJS(G, G.y0);
  const bez = (B, n, out) => { for (let i = out.length ? 1 : 0; i <= n; i++) out.push(bez4(B, i / n)); return out; };
  const lenOf = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };
  let K1, common = [];
  if (phone) {
    // down behind the copy, which spans the card less a small margin, and out from under its foot
    // towards the helix. (A thread in the gutter at the card's edge read as a border line, QA 28 Sep.)
    // The copy keeps it out altogether (see readPageRects), so the sand seems to pass behind the words
    const gx = h.x + 0.2 * h.w, K2 = [gx, h.y + h.h - 60];
    K1 = [gx, h.y + 0.43 * h.h];
    bez([K1, [gx, K1[1] + (K2[1] - K1[1]) / 3], [gx, K2[1] - (K2[1] - K1[1]) / 3], K2], 40, common);
    const d2 = Math.hypot(H0[0] - K2[0], H0[1] - K2[1]);
    bez([K2, [gx, K2[1] + 0.45 * d2], [H0[0], H0[1] - 0.45 * d2], H0], 40, common);
  } else {
    // turning down the card's left margin
    const mx = h.x + Math.max(40, 0.045 * h.w);
    K1 = [mx, h.y + 0.80 * h.h];
    const d2 = Math.hypot(H0[0] - K1[0], H0[1] - K1[1]);
    bez([K1, [mx, K1[1] + 0.45 * d2], [H0[0], H0[1] - 0.45 * d2], H0], 60, common);
  }
  const firsts = starts.map((st) => {
    const S0 = st.p, d1 = Math.hypot(K1[0] - S0[0], K1[1] - S0[1]), f = phone ? 0.55 : 0.62;
    return bez([S0, [S0[0] + st.d[0] * f * d1, S0[1] + st.d[1] * f * d1], [K1[0], K1[1] - (phone ? 0.55 : 0.50) * d1], K1], phone ? 40 : 60, []);
  });
  const lens = firsts.map(lenOf), Lmax = Math.max(...lens);
  G.pre = lens.map((l) => Lmax - l);
  G.Lb = Lmax + lenOf(common);
  G.LPs = firsts.map((first, k) => {
    const st = starts[k], pts = G.pre[k] > 0.5 ? [[st.p[0] - st.d[0] * G.pre[k], st.p[1] - st.d[1] * G.pre[k]]].concat(first) : first.slice();
    for (let i = 1; i < common.length; i++) pts.push(common[i]);
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L0 = acc[acc.length - 1], LP = new Float32Array(LEAD_N * 2);
    for (let j = 0, i = 0; j < LEAD_N; j++) {
      const target = L0 * j / (LEAD_N - 1);
      while (i < pts.length - 2 && acc[i + 1] < target) i++;
      const f = Math.min(1, Math.max(0, (target - acc[i]) / Math.max(1e-9, acc[i + 1] - acc[i])));
      LP[2 * j] = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f;
      LP[2 * j + 1] = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
    }
    return LP;
  });
  G.LP = G.LPs[0];
  let top = Infinity; for (const LP of G.LPs) for (let j = 1; j < LP.length; j += 2) top = Math.min(top, LP[j]);
  G.top = top - 60;
  // band width: desktop starts wide inside the ribbon; a phone keeps it narrow in the card and
  // widens as it comes out from under the copy (the start's width and fade for each scene: see drawStream)
  G.grow = phone ? [0.10, G.Lb - 150, G.Lb + 380, 20] : [0.8, 0, G.Lb * 0.8, 20];
  G.nTurns = (G.end - G.y0) / G.pitch;
  G.Ltot = G.Lb + G.nTurns * G.Lturn;
  return G;
}
// the stream's length along the path at axis height y (the helix part), for drawing only the stretch
// near the viewport
function streamSAt(G, y) {
  if (y <= G.y0) return G.Lb;
  const q = (y - G.y0) / G.pitch, n = Math.floor(q), f = (q - n) * G.M;
  const i = Math.min(G.M - 1, Math.floor(f));
  const c = G.cum[i] + (G.cum[i + 1] - G.cum[i]) * (f - i);
  return G.Lb + n * G.Lturn + c;
}

/* ------------------------------------------------------------------ the scene */
export function createGrainScene(canvas, opts = {}) {
  const O = Object.assign({
    intro: false, reducedMotion: false, handImageUrl: '', wordmark: 'RaisedHand', font: 'Inter, sans-serif',
    avoidRects: null, onPhase: null, onFirstFrame: null, stats: false, mode: 'card', pageLayout: null,
    loop: true, onScene: null, dunesOnly: false, transparent: false,
  }, opts);
  // v5: the loop runs unless the host turns it off; never for reduced motion (one still of the silk)
  const LOOPS = O.loop !== false && !O.reducedMotion;
  const PAGE = O.mode === 'page' && typeof O.pageLayout === 'function';
  const S = {
    gl: null, P: {}, T: {}, sets: null, cssW: 0, cssH: 0, dpr: 1, W: 0, H: 0, frac: 1, dprCap: 0,
    running: false, raf: 0, simT: O.reducedMotion ? STILL_T : HERO_T0, lastNow: 0, rects: [], float: false,
    fallback: false, genW: 0, genH: 0, grains: null, lu: null, ready: false, wantStart: false, destroyed: false,
    still: false, firstFrame: false, frames: 0,
    intro: !!O.intro && !O.reducedMotion, ti: 0, tg: TL.tg, rate: 1, phase: '', mark: null, hand: null,
    logoE: 1,
    sceneW: 0, sceneH: 0, L: null, G: null, qrects: [], nQ: 0, streamN: 0, Lcap: 0, genVw: 0, amt: PAGE && O.intro && !O.reducedMotion ? 0 : 1,
    scrollRaf: 0, pathPx: 0, view: 0, viewOff: null, over: 0, vhMax: 0, vhW: 0, heroOn: true, lastRender: 0,
    // v5: the loop's clock (seconds since it began), whether it runs, where it is (see loopState), each
    // scene's own clock (see rebase), the scenes that could not be built, the scenes' layout (see
    // pumpScenes) and a rebuild of the grains held back until the silk shows (see resize)
    lt: 0, looping: false, ls: { a: 0, b: -1, t: 0, k: 0, tr: 0 }, sceneName: '', clkBase: [0, 0, 0], failed: [false, false, false], itgt: 0,
    job: null, want: null, wantAt: 0, scenesOk: false, duneCam: null, handLay: null, dsrc: null, pendingGen: false,
    wts: [1, 0, 0],
  };
  SCENE_REFS++;
  // uniform arrays, made once
  const BUF = { R: new Float32Array(MAX_RECTS * 4), Rs: new Float32Array(MAX_RECTS), Q: new Float32Array(MAX_QRECTS * 4), Qs: new Float32Array(MAX_QRECTS) };
  for (let i = 0; i < MAX_QRECTS; i++) S.qrects.push([0, 0, 0, 0, 0]);
  const stats = { frames: 0, deltas: [], gpu: [], n: 0, nA: 0, nF: 0, nS: 0, nSDrawn: 0, heroDrawn: 0, nLogo: 0, frac: 1, renderer: '', dpr: 1, genMs: 0, float: false, mode: PAGE ? 'page' : 'card' };
  let pending = [];
  let win = [];

  const phase = (name) => { if (S.phase === name) return; S.phase = name; try { O.onPhase && O.onPhase(name); } catch (e) { console.error(e); } };

  /* ---------------- GL setup */
  function initGL() {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: !!O.transparent, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    S.gl = gl;
    S.float = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    S.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');   // GPU time, when the browser offers it (adapt uses it)
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    stats.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (/swiftshader|llvmpipe|software|basic render/i.test(stats.renderer)) { S.frac = 0.4; S.dprCap = 1; stats.frac = 0.4; }
    S.P.anch = program(gl, COMMON + SILK_ANCH + SCENES_GLSL + INTRO, FS_GRAIN);
    S.P.fly = program(gl, COMMON + SILK_FLY + SCENES_GLSL + INTRO, FS_GRAIN);
    if (PAGE) S.P.stream = program(gl, COMMON + STREAM_VS, FS_GRAIN);
    S.P.down = program(gl, VS_QUAD, FS_DOWN);
    S.P.blur = program(gl, VS_QUAD, FS_BLUR);
    S.P.comp = program(gl, VS_QUAD, FS_COMP);
    S.quadVao = gl.createVertexArray();
    gl.vertexAttrib4f(1, 0, 0, -1, 0);   // grains outside the mark
    gl.vertexAttrib2f(2, 0, 0);
    for (let l = 3; l <= 6; l++) gl.vertexAttrib4f(l, 0, 0, 0, 0);   // v5: the hand and the dunes, until they are laid out
    return true;
  }
  function makeTarget(w, h) {
    const gl = S.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, S.float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, S.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (S.float && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      S.float = false;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }
  function freeTarget(t) { if (t && S.gl) { S.gl.deleteTexture(t.tex); S.gl.deleteFramebuffer(t.fb); } }
  function sizeTargets() {
    ['grain', 'b1', 'b2'].forEach((k) => freeTarget(S.T[k]));
    S.T.grain = makeTarget(S.W, S.H);
    const bw = Math.max(8, Math.round(S.W / 4)), bh = Math.max(8, Math.round(S.H / 4));
    S.T.b1 = makeTarget(bw, bh); S.T.b2 = makeTarget(bw, bh);
    stats.float = S.float;
  }
  function uploadSet(set) {
    const gl = S.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, set.g, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, buf, n: set.n };
  }
  function uploadMark(anchBuf, mark) {
    const gl = S.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, anchBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, mark.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16);
    gl.bindVertexArray(null);
    return { vao, buf, n: mark.n };
  }
  function freeMark() {
    if (S.sets && S.sets.mark && S.gl) { S.gl.deleteVertexArray(S.sets.mark.vao); S.gl.deleteBuffer(S.sets.mark.buf); S.sets.mark = null; }
  }
  function freeScenes() {
    const Sc = S.sets && S.sets.scenes;
    if (!Sc || !S.gl) return;
    S.gl.deleteBuffer(Sc.hBuf); if (Sc.dBuf) S.gl.deleteBuffer(Sc.dBuf);
    S.sets.scenes = null;
  }
  function freeSets() {
    if (!S.sets || !S.gl) return;
    freeMark();
    freeScenes();
    for (const k of ['anch', 'fly']) { S.gl.deleteVertexArray(S.sets[k].vao); S.gl.deleteBuffer(S.sets[k].buf); }
    S.sets = null;
  }

  /* ---------------- geometry */
  function grainBudget(cssW, cssH) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    return Math.round(Math.min(coarse ? 170000 : 440000, Math.max(60000, cssW * cssH * 0.30)));
  }
  function pxSizes() {
    const d = S.dpr, base = Math.max(1, Math.round(d));
    return [d >= 1.75 ? base - 1 : base, base, base + 1];
  }
  /* page mode: the host's layout, read once per frame. A bad or missing answer keeps the last one. */
  function readLayout() {
    let L = null;
    try { L = O.pageLayout(); } catch (e) { L = null; }
    const ok = L && L.hero && L.hero.w > 0 && L.hero.h > 0 && L.viewportW > 0 && L.viewportH > 0;
    if (ok) S.L = L;
    return S.L;
  }
  /* page mode: the canvas is part of the document, not fixed to the viewport. It is the viewport's
     height plus S.over above and below, and the engine moves it (a transform) so that it stays centred
     on the viewport. The browser scrolls it with the page on its compositor, exactly in step with the
     text and cards, even when it scrolls ahead of the frame being drawn; the overscan covers that. */
  function viewFor(L) {
    const org = L.originY || 0, bottom = L.layerBottom != null ? L.layerBottom : L.docH;
    let t = (L.scrollY || 0) - S.over;
    t = Math.max(org, Math.min(t, Math.max(org, bottom - S.cssH)));
    const d = window.devicePixelRatio || 1;
    return Math.round(t * d) / d;
  }
  function placeCanvas(L) {
    S.view = viewFor(L);
    const off = S.view - (L.originY || 0);
    if (off !== S.viewOff) { S.viewOff = off; canvas.style.transform = `translate3d(0,${off}px,0)`; }
  }
  function readRects() {
    if (PAGE) { readPageRects(); return; }
    let list = [];
    try { list = (O.avoidRects && O.avoidRects()) || []; } catch (e) { list = []; }
    const H = S.cssH || 1;
    S.rects = list.slice(0, MAX_RECTS).filter((r) => r && r.w > 0 && r.h > 0).map((r) => ({
      x0: r.x / H, y0: r.y / H, x1: (r.x + r.w) / H, y1: (r.y + r.h) / H, s: r.s == null ? 0.84 : Math.max(0, Math.min(1, r.s)),
    }));
    pickCopy();
  }
  // Rects inside the card quieten the ribbons (scene units, as avoidRects); the ones near the canvas
  // quieten the stream (canvas CSS px). Runs every frame, so it reuses its arrays.
  const near = [];
  // More blocks near the canvas than the shader takes (a busy stretch of page): the ones on screen
  // come first, then the thin ones (the seams between cards, a line of words), which would show as a
  // bright line if dropped and cost no more than a big block, then the largest
  let onTop = 0, onBot = 0;
  const onScreen = (r) => (r.y < onBot && r.y + r.h > onTop ? 1 : 0);
  const thin = (r) => (Math.min(r.w, r.h) <= 48 ? 1 : 0);
  const rankQ = (a, b) => onScreen(b) - onScreen(a) || thin(b) - thin(a) || b.w * b.h - a.w * a.h;
  function readPageRects() {
    const L = S.L;
    if (!L) return;
    const h = L.hero, H = h.h, top = S.view, bot = S.view + S.cssH;
    const list = Array.isArray(L.avoid) ? L.avoid : [];
    const str = (r) => (r.s == null ? 0.84 : Math.max(0, Math.min(1, r.s)));
    // the stream: a rect with no strength of its own (the card's copy and nav) keeps it out altogether
    const strQ = (r) => (r.s == null ? 1 : Math.max(0, Math.min(1, r.s)));
    let nr = 0;
    near.length = 0;
    for (const r of list) {
      if (!r || !(r.w > 0) || !(r.h > 0)) continue;
      if (nr < MAX_RECTS && r.x < h.x + h.w && r.x + r.w > h.x && r.y < h.y + h.h && r.y + r.h > h.y) {
        const o = S.rects[nr] || (S.rects[nr] = {});
        o.x0 = (r.x - h.x) / H; o.y0 = (r.y - h.y) / H; o.x1 = (r.x + r.w - h.x) / H; o.y1 = (r.y + r.h - h.y) / H; o.s = str(r);
        nr++;
      }
      if (r.y < bot + 80 && r.y + r.h > top - 80) near.push(r);
    }
    S.rects.length = nr;
    if (near.length > MAX_QRECTS) { onTop = L.scrollY || 0; onBot = onTop + L.viewportH; near.sort(rankQ); }
    S.nQ = Math.min(MAX_QRECTS, near.length);
    for (let i = 0; i < S.nQ; i++) {
      const r = near[i], q = S.qrects[i];
      q[0] = r.x; q[1] = r.y - top; q[2] = r.x + r.w; q[3] = r.y + r.h - top; q[4] = strQ(r);
    }
    pickCopy();
  }
  function pickCopy() {
    // the largest rect is "the copy": the composite also darkens the background behind it a touch
    let best = null, area = 0;
    for (const r of S.rects) { const a = (r.x1 - r.x0) * (r.y1 - r.y0); if (a > area && r.s >= 0.8) { area = a; best = r; } }
    S.copy = best || NO_COPY;
  }
  const NO_COPY = { x0: -9, y0: -9, x1: -9, y1: -9 };
  function generate() {
    const t0 = performance.now();
    const A = S.sceneW / S.sceneH;
    const maxN = grainBudget(S.sceneW, S.sceneH);
    const g = buildGrains(A, maxN, 20260927);
    S.lu = layerUniforms(g.layers, A);
    S.grains = g;
    if (S.gl) {
      freeSets();
      S.sets = { anch: uploadSet(g.anch), fly: uploadSet(g.fly), mark: null };
      if (S.intro && S.hand) {
        const sz = pxSizes(), d2 = S.dpr * S.dpr;
        const area = (0.24 * sz[0] * sz[0] + 0.66 * sz[1] * sz[1] + 0.10 * sz[2] * sz[2]) / d2;   // CSS px^2 per grain
        const mark = sampleMark(S.sceneW, S.sceneH, S.hand, O.font, O.wordmark, 1.45, Math.floor(g.anch.n * 0.45), mulberry32(77));
        S.logoE = 2.3 / (mark.dens * area) * (S.float ? 1 : 0.5);
        S.sets.mark = uploadMark(S.sets.anch.buf, mark);
        S.markLayout = mark.layout;
        stats.nLogo = mark.n;
      }
    }
    stats.n = maxN; stats.nA = g.anch.n; stats.nF = g.fly.n; stats.genMs = Math.round(performance.now() - t0);
    S.genW = S.sceneW; S.genH = S.sceneH;
    if (S.gl && LOOPS) wantScenes();
  }
  /* v5: ask for the hand and the dunes for the current grains. The request waits for the startup to
     settle (or, with no startup, for the first frames to be on screen) and for resizing to pause
     (300 ms), and only one layout is ever under way at a time (see pumpScenes). */
  function wantScenes() {
    const g = S.grains;
    // v7: the hand first, on its own ('hand'), then the dunes with it ('full'; see pumpScenes)
    // dunesOnly (Ty, 10 Oct: the sand should be there as the site opens): no hand to lay out first, so
    // straight to the dunes, with no wait before the first layout.
    S.want = { g, key: S.sceneW + 'x' + S.sceneH + '@' + S.dpr.toFixed(3) + '#' + g.anch.n + '/' + g.fly.n, stage: O.dunesOnly ? 'full' : 'hand', keep: null };
    // during the startup there is no resizing to wait out: every moment counts for the hand to be ready
    S.wantAt = performance.now() + (S.intro || (O.dunesOnly && !S.dunesAsked) ? 0 : 300);
    S.dunesAsked = true;   // later layouts (a resize) wait out the resizing as before
    S.scenesOk = false; S.failed[1] = S.failed[2] = false;
  }
  /* v5: the dune field's lit image, for stippling (read back once) and for the dunes' bodies in the
     composite (kept as a texture). It is made over a few frames so that no frame waits on it: the
     program compiles in parallel where the browser can, the raymarch is drawn in four strips, one a
     frame, and the pixels are read back through a buffer once a fence says the GPU is done. */
  function bakeStart(A) {
    const gl = S.gl, cam = duneCamera(A);
    // a little under one bake pixel per CSS px (grains land anywhere inside theirs)
    const bw = Math.max(64, Math.min(1200, Math.round(S.sceneW * DUNE_BAKE_SCALE))), bh = Math.max(1, Math.round(bw / A));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!S.P.bake && !S.bakeProg) S.bakeProg = programStart(gl, VS_QUAD, BAKE_FS);
    return { A, cam, bw, bh, tex, fb, strip: 0, pbo: null, sync: null, t0: performance.now(), ms: 0 };
  }
  // one step of the bake; true once the pixels are in hand (b.px). Throws if the GPU cannot make it.
  function bakeStep(b) {
    const gl = S.gl, T0 = performance.now();
    if (!S.P.bake) {
      const par = gl.getExtension('KHR_parallel_shader_compile');
      if (par && !gl.getProgramParameter(S.bakeProg.p, par.COMPLETION_STATUS_KHR)) return false;
      const st = S.bakeProg; S.bakeProg = null;
      S.P.bake = programFinish(gl, st);
    }
    if (b.strip < 4) {
      const cam = b.cam, T = DUNE_TUNE, U = S.P.bake.u, y0 = Math.floor(b.bh * b.strip / 4), y1 = Math.floor(b.bh * (b.strip + 1) / 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
      gl.viewport(0, 0, b.bw, b.bh);
      gl.disable(gl.BLEND);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, y0, b.bw, y1 - y0);
      gl.useProgram(S.P.bake.p);
      gl.uniform2f(U.u_res, b.bw, b.bh);
      gl.uniform3fv(U.u_camPos, cam.pos);
      gl.uniformMatrix3fv(U.u_camRot, false, cam.rot);
      gl.uniform1f(U.u_tanHalf, cam.tanHalf);
      gl.uniform1f(U.u_aspect, b.A);
      gl.uniform3fv(U.u_sun, cam.sun);
      gl.uniform3f(U.u_shape, T.amp, T.lam, T.bigBoost);
      gl.uniform1f(U.u_fog, T.fog);
      gl.uniform3f(U.u_side, T.sideC, T.sideW, T.sideMin);
      gl.bindVertexArray(S.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      if (++b.strip === 4) {
        b.pbo = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b.pbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, b.bw * b.bh * 4, gl.STREAM_READ);
        gl.readPixels(0, 0, b.bw, b.bh, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        b.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
      }
      gl.bindVertexArray(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      b.ms += performance.now() - T0;
      return false;
    }
    const w = gl.clientWaitSync(b.sync, 0, 0);
    if (w === gl.TIMEOUT_EXPIRED) return false;
    if (w === gl.WAIT_FAILED) throw new Error('bake readback failed');
    b.px = new Uint8Array(b.bw * b.bh * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, b.px);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    b.ms += performance.now() - T0;
    bakeEnd(b, true);
    return true;
  }
  // done with the bake's working parts (keep: its image stays as the dunes' texture)
  function bakeEnd(b, keep) {
    const gl = S.gl;
    if (!b || !gl) return;
    if (b.sync) { gl.deleteSync(b.sync); b.sync = null; }
    if (b.pbo) { gl.deleteBuffer(b.pbo); b.pbo = null; }
    if (b.fb) { gl.deleteFramebuffer(b.fb); b.fb = null; }
    if (keep) { if (S.T.bake) gl.deleteTexture(S.T.bake); S.T.bake = b.tex; S.duneCam = b.cam; stats.bakeMs = Math.round(b.ms); }
    else if (b.tex) gl.deleteTexture(b.tex);
    b.tex = null;
  }
  /* v5: lay out the loop's hand and dunes for this card (once per size), a step each frame: the dunes'
     image is baked on the GPU (bakeStep), the rest runs in a worker. Each comes back in the silk's grain
     order and is added to the silk's vertex arrays (attributes 3 to 6), so one draw of a grain knows its
     place in every scene. A newer request waits for the one under way; a bake under way is dropped. */
  function pumpScenes() {
    const gl = S.gl;
    // v6: laid out while the intro plays too, so the grains can settle straight into the hand
    if (!gl || !LOOPS || (!S.looping && !S.intro)) return;
    let J = S.job;
    if (J && J.stage === 'bake' && S.want) { bakeEnd(J.bake, false); S.job = J = null; }   // a newer layout: start again
    if (!J) {
      if (!S.want || performance.now() < S.wantAt || S.frames < 3) return;
      // v7: the dunes (and their bake, which can hold up a phone's frames) wait for the startup to end;
      // they are not needed until the hand has held for LOOP.hold seconds
      if (S.want.stage === 'full' && S.intro) return;
      const A = S.sceneW / S.sceneH;
      /* v7 (Tayyib, 28 Sep: "On mobile the startup should be the same as desktop"): the hand is laid out
         on its own first. It needs no bake, and the bake (a shader, then the dune field in four strips)
         is what kept a phone's hand from being ready before the gust, so its startup settled into the
         silk and the hand came seconds later. The dunes follow in a second layout that keeps every
         grain's place in the hand (matchScenes' keep), so nothing on screen moves when they join. */
      const handOnly = S.want.stage === 'hand';
      J = S.job = { want: S.want, A, t0: performance.now(), stage: handOnly ? 'post' : 'bake', bake: null };
      S.want = null;
      if (!handOnly) { try { J.bake = bakeStart(A); } catch (err) { console.warn('[grain] dunes', err); J.stage = 'post'; } }
    }
    if (J.stage === 'bake') {
      try { if (!bakeStep(J.bake)) return; }
      catch (err) { console.warn('[grain] dunes', err); bakeEnd(J.bake, false); J.bake = null; S.P.bake = null; S.bakeProg = null; }
      J.stage = 'post';
    }
    if (J.stage !== 'post') return;
    J.stage = 'wait';
    const g = J.want.g, A = J.A;
    const sz = pxSizes(), avgArea = (0.24 * sz[0] * sz[0] + 0.66 * sz[1] * sz[1] + 0.10 * sz[2] * sz[2]) / (S.dpr * S.dpr);   // CSS px^2 per grain
    // The dunes' layout keeps the hand's own box: navBottom() moves when the nav lands after the startup,
    // and a new box would move every grain of the hand as the dunes join (review, 28 Sep).
    const lay = J.want.lay || handLayout(A, S.sceneH, navBottom());
    const bake = J.bake && J.bake.px ? { px: J.bake.px, bw: J.bake.bw, bh: J.bake.bh } : null;
    const handOnly = J.want.stage === 'hand';
    const args = { anch: g.anch.g, fly: g.fly.g, nA: g.anch.n, nF: g.fly.n, layers: g.layers.map((L) => ({ P: L.P, W: L.W, T: L.T, M: L.M })), t: HERO_T0 + 20,
      lay, A, cssH: S.sceneH, avgArea, seed: 20260928, bake: handOnly ? null : bake, blow: DUNE_BLOW, keep: handOnly ? null : J.want.keep };
    buildScenesOffThread(args).then((r) => {
      if (S.job === J) S.job = null;
      if (S.destroyed || !S.gl || !S.sets || S.grains !== g) return;   // a newer layout has taken over
      if (!r) { S.failed[1] = S.failed[2] = true; console.warn('[grain] the loop\'s scenes could not be laid out; the silk stays'); return; }
      S.handLay = lay;
      attachScenes(r);
      if (handOnly) {
        stats.handMs = Math.round(performance.now() - J.t0);
        // now the dunes, keeping the hand as it is (unless a newer layout has been asked for meanwhile)
        if (!S.want) { S.want = { ...J.want, stage: 'full', keep: r.first || null, lay }; S.wantAt = performance.now(); }
        return;
      }
      if (!r.D) S.failed[2] = true;
      stats.scenesMs = Math.round(performance.now() - J.t0); stats.round = r.round;
    });
  }
  function navBottom() {
    let b = 0;
    for (const r of S.rects) if (r.y0 < 0.03 && r.y1 < 0.25) b = Math.max(b, r.y1);
    return b || null;
  }
  function attachScenes(r) {
    const gl = S.gl, St = S.sets;
    freeScenes();
    const mk = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    const hBuf = mk(r.H), dBuf = r.D ? mk(r.D) : null;
    const bind = (vao, first) => {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, hBuf);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, first * 32);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, first * 32 + 16);
      if (dBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, dBuf);
        gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, first * 32);
        gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, first * 32 + 16);
      }
      gl.bindVertexArray(null);
    };
    bind(St.anch.vao, 0);
    bind(St.fly.vao, St.anch.n);   // the flying set's grains follow the anchored set's in the scenes' buffers
    St.scenes = { hBuf, dBuf, hand: true, dunes: !!dBuf };
    S.dsrc = r.dsrc || null;
    S.scenesOk = true;
    if (PAGE) generateStream();   // the stream's start in the hand and the dunes
  }
  /* page mode: the stream's path for the current layout. Its grains are made in the shader from their
     vertex ids and flow round a loop of length Lcap (a little longer than the path, which ends at the
     bottom of the page). Lcap and the count change only when the width or the page's length changes a
     lot, so when the page grows or shrinks a little (images, fonts, an accordion) no grain moves: only
     the path's end does. */
  function generateStream() {
    if (!PAGE || !S.gl || !S.L) return;
    // v5: once the hand and the dunes are laid out, each has its own start
    const hl = S.handLay, src = S.scenesOk ? { hand: hl ? [hl.x0 + 15 * hl.k, hl.y0 + 50 * hl.k] : null, dunes: S.dsrc } : null;
    const G = streamGeom(S.L, S.vhMax || S.L.viewportH, src), G0 = S.G;
    // the helix keeps its grains where they are when only the lead-in's length changes
    if (G0 && Math.abs(G0.Lb - G.Lb) > 0.01 && Math.abs(S.genVw - S.L.viewportW) <= 1 && S.Lcap) S.pathPx = ((S.pathPx + G.Lb - G0.Lb) % S.Lcap + S.Lcap) % S.Lcap;
    S.G = G;
    const vwChanged = Math.abs(S.genVw - S.L.viewportW) > 1;
    if (!S.Lcap || vwChanged || G.Ltot > S.Lcap || G.Ltot < S.Lcap * 0.6) {
      S.Lcap = G.Ltot * 1.25;
      S.streamN = Math.round(Math.min(1.2e6, S.Lcap * G.K.dens));
      S.genVw = S.L.viewportW;
      S.pathPx %= S.Lcap;
    }
    stats.nS = S.streamN;
  }
  function measure() {
    const cssW = canvas.clientWidth;
    let cssH = canvas.clientHeight;
    if (!cssW || (!cssH && !PAGE)) return false;
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (PAGE) {
      const L = readLayout();
      if (!L) return false;
      S.over = coarse ? OVERSCAN.coarse : OVERSCAN.fine;
      // keep the tallest viewport seen at this width: a phone's toolbar showing and hiding (a small,
      // height-only change) then moves neither the canvas's size nor the stream's path
      if (Math.abs(cssW - S.vhW) > 1) { S.vhW = cssW; S.vhMax = 0; }
      const vh = L.viewportH;
      if (!S.vhMax || vh > S.vhMax || vh < S.vhMax * 0.8) S.vhMax = vh;
      cssH = Math.ceil(S.vhMax + 2 * S.over);
      if (canvas.style.height !== cssH + 'px') canvas.style.height = cssH + 'px';
      S.sceneW = L.hero.w; S.sceneH = L.hero.h;
    }
    let dpr = Math.min(window.devicePixelRatio || 1, PAGE && coarse ? 2 : 3);   // page mode on a phone: 2 is plenty
    const budget = coarse ? 9e6 : 15e6;   // device-pixel budget
    if (cssW * cssH * dpr * dpr > budget) dpr = Math.sqrt(budget / (cssW * cssH));
    if (S.dprCap) dpr = Math.min(dpr, S.dprCap);
    S.cssW = cssW; S.cssH = cssH; S.dpr = dpr; stats.dpr = +dpr.toFixed(3);
    if (!PAGE) { S.sceneW = cssW; S.sceneH = cssH; }
    return true;
  }
  function resize(force) {
    if (S.destroyed || !S.ready && !force) return;
    if (!measure()) return;
    const W = Math.round(S.cssW * S.dpr), H = Math.round(S.cssH * S.dpr);
    const sizeChanged = W !== S.W || H !== S.H;
    S.W = W; S.H = H;
    if (PAGE) placeCanvas(S.L);
    readRects();
    if (S.gl && sizeChanged) { canvas.width = W; canvas.height = H; sizeTargets(); }
    // a new sheet only when the hero's shape really changes (not for a phone's URL bar)
    let needGen = force === true || !S.grains || Math.abs(S.sceneW - S.genW) > 1 || Math.abs(S.sceneH - S.genH) / S.genH > 0.12;
    if (needGen) {
      // v5: the new grains start on the silk. Away from the silk's hold the rebuild waits for the loop to
      // come round to it (the old grains are laid out in units of the card's height, so they still fit),
      // unless the card has changed shape a lot (turned, or more than 30% wider or taller or narrower)
      const inSilk = !S.looping || (S.ls.a === 0 && S.ls.b < 0);
      const A0 = S.genW / (S.genH || 1), A1 = S.sceneW / S.sceneH;
      const big = force === true || !S.grains || (A0 >= 0.95) !== (A1 >= 0.95) || Math.abs(S.sceneW - S.genW) / S.genW > 0.3 || Math.abs(S.sceneH - S.genH) / S.genH > 0.3;
      if (big || inSilk) { S.pendingGen = false; generate(); if (!inSilk) toSilk(); }
      else { S.pendingGen = true; needGen = false; }
    }
    if (PAGE) generateStream();
    // resizing the canvas clears it: draw straight away, in this frame, even while the loop runs
    // (otherwise one blank frame shows)
    if (S.fallback) { if (needGen) drawFallback(); else blitFallback(); }
    else if (S.ready && (sizeChanged || !S.running)) renderFrame();
  }

  /* ---------------- drawing */
  function setUniforms(prog) {
    const gl = S.gl, U = prog.u, L = S.lu;
    gl.uniform1f(U.u_time, S.intro ? S.simT : simWrap());
    gl.uniform1f(U.u_aspect, S.sceneW / S.sceneH);
    gl.uniform2f(U.u_vp, S.cssW, S.cssH);
    if (PAGE && S.L) {
      const h = S.L.hero;
      gl.uniform4f(U.u_xf, h.x, h.y - S.view, h.h, 0);
      gl.uniform3f(U.u_clip, 1, (h.r == null ? 28 : h.r) / h.h, 240 / h.h);
    } else {
      gl.uniform4f(U.u_xf, 0, 0, S.cssH, 0);
      gl.uniform3f(U.u_clip, 0, 0, 0);
    }
    const px = pxSizes();
    gl.uniform3f(U.u_px, px[0], px[1], px[2]);
    gl.uniform1f(U.u_gain, LOOK.gain * Math.pow(1 / S.frac, 0.85) * (S.float ? 1 : 0.5));   // 8-bit targets store at half scale
    gl.uniform2fv(U.u_P, L.P);
    gl.uniform4fv(U.u_W, L.W); gl.uniform4fv(U.u_T, L.T); gl.uniform4fv(U.u_M, L.M); gl.uniform4fv(U.u_E, L.E);
    gl.uniform4f(U.u_pool, L.pool[0], L.pool[1], L.pool[2], L.pool[3]);
    const R = BUF.R, Rs = BUF.Rs;
    R.fill(0); Rs.fill(0);
    S.rects.forEach((r, i) => { R[i * 4] = r.x0; R[i * 4 + 1] = r.y0; R[i * 4 + 2] = r.x1; R[i * 4 + 3] = r.y1; Rs[i] = r.s; });
    gl.uniform4fv(U.u_R, R); gl.uniform1fv(U.u_Rs, Rs); gl.uniform1i(U.u_Rn, S.rects.length);
    gl.uniform2f(U.u_wind, LOOK.wind[0], LOOK.wind[1]);
    gl.uniform1f(U.u_turb, LOOK.turb);
    gl.uniform1f(U.u_intro, S.intro ? 1 : 0);
    gl.uniform1f(U.u_ti, S.ti);
    gl.uniform1f(U.u_tg, S.tg);
    if (U.u_itgt) gl.uniform1f(U.u_itgt, S.itgt);
    gl.uniform1f(U.u_logoE, S.logoE);
    // v5: the loop
    const ls = S.looping ? S.ls : HOLD_SILK, hl = S.handLay, A = S.genW / (S.genH || 1), W = TR_WIND;
    gl.uniform4f(U.u_loop, ls.a, ls.b, ls.t, ls.tr || 3.5);
    gl.uniform4f(U.u_tr, LOOP.front0, LOOP.front, LOOP.land0, LOOP.land);
    // how far sand that goes round travels (the card's length along the wind, and a margin at each end)
    gl.uniform4f(U.u_tw, W[0], W[1], -(W[0] * A + W[1]) + 2 * TR_MARGIN, TR_MARGIN);
    gl.uniform3f(U.u_clk, clock(0), clock(1), clock(2));
    // on a phone the hand stands close above the copy: its quiet feather is narrow, and it is a touch brighter
    gl.uniform4f(U.u_hl, HAND_LIGHT.az, HAND_LIGHT.el, hl && hl.portrait ? 0.05 : 0.13, HAND_GAIN * (hl && hl.portrait ? 1.15 : 1));
    gl.uniform4f(U.u_hand, hl ? hl.pivot[0] : 0, hl ? hl.pivot[1] : 0, 0.010, 0);
    gl.uniform4f(U.u_hw, HAND_WIND[0], HAND_WIND[1], 0, 0);
    gl.uniform4f(U.u_dw, DUNE_WIND[0], DUNE_WIND[1], 0, 0);
    gl.uniform1f(U.u_dgain, DUNE_GAIN);
  }
  /* page mode: draw only the stretch of the stream that can be on the canvas. Grain i sits at
     s = fract(i / n + sh) * Lcap along the path, so that stretch is one run of vertex ids (two when it
     wraps), and a draw with no buffers at all. */
  function drawStream() {
    const gl = S.gl, G = S.G;
    if (!G || !S.streamN || S.amt <= 0.001) { stats.nSDrawn = 0; return; }
    const prog = S.P.stream, U = prog.u, n = S.streamN, Lc = S.Lcap;
    const sh = S.pathPx / Lc;
    const m = G.tilt * G.R * 1.12 + G.hw * 2.4 + 12;   // as in STREAM_VS
    const yTop = S.view - m, yBot = S.view + S.cssH + m;
    if (yBot < G.top) { stats.nSDrawn = 0; return; }
    const a = (yTop <= G.y0 ? 0 : streamSAt(G, yTop)) / Lc, b = Math.min(G.Ltot, streamSAt(G, yBot)) / Lc;
    if (b <= a) { stats.nSDrawn = 0; return; }
    let s0 = a - sh; s0 -= Math.floor(s0);
    const s1 = s0 + (b - a);
    const i0 = Math.max(0, Math.floor(s0 * n) - 2);
    const r1 = [i0, Math.min(n, Math.ceil(s1 * n) + 2)], r2 = s1 > 1 ? [0, Math.min(n, Math.ceil((s1 - 1) * n) + 2)] : null;

    gl.useProgram(prog.p);
    gl.uniform1f(U.u_time, simWrap());
    gl.uniform2f(U.u_vp, S.cssW, S.cssH);
    const px = pxSizes();
    gl.uniform3f(U.u_px, px[0], px[1], px[2]);
    gl.uniform1f(U.u_gain, LOOK.gain * G.K.gain * Math.pow(1 / S.frac, 0.85) * (S.float ? 1 : 0.5));
    gl.uniform1f(U.u_n, n);
    gl.uniform1f(U.u_sh, sh);
    gl.uniform1f(U.u_view, S.view);
    gl.uniform1f(U.u_frac, S.frac);
    gl.uniform1f(U.u_amt, S.amt);
    gl.uniform4f(U.u_len, G.Lb, Lc, G.y0, G.end);
    gl.uniform1fv(U.u_warp, G.warp);
    gl.uniform4f(U.u_hx, G.R, G.pitch, G.hw, G.tilt);
    gl.uniform4f(U.u_ax, G.axC, G.sway, G.ph, G.Lturn);
    gl.uniform4f(U.u_look, G.K.backL, G.K.backW, G.K.quiet, G.K.leadQuiet);
    // v5: the stream starts where the scene's blown sand leaves it (see streamGeom): the silk's frayed
    // end, the hand's thumb and first finger, the dunes' left crests. Out of the hand and the dunes it
    // starts as a thinner thread, dimmer, and fades in over a longer run. In a change its start moves
    // across as the gust front reaches the card's left side, and the gust makes it a little brighter
    // for a moment (a pulse of light, not more grains)
    const ls = S.ls, lp = S.looping, sa = lp ? ls.a : 0, sb = lp && ls.b >= 0 ? ls.b : sa, gr = G.grow;
    const tn = lp && ls.b >= 0 ? ls.t * 3.5 / ls.tr : 0, wB = sb !== sa ? sstep(0.9, 2.2, tn) : 0;
    const gust = lp && ls.b >= 0 ? Math.sin(Math.PI * Math.min(1, ls.t / ls.tr)) : 0;
    const W0 = G.phone ? [gr[0], gr[0], gr[0]] : [gr[0], 0.45, 0.22], F0 = G.phone ? [gr[3], 60, 200] : [gr[3], 90, 380], K0 = [1, 0.6, 0.5];
    const mixk = (v) => v[sa] + (v[sb] - v[sa]) * wB;
    gl.uniform4fv(U.u_LPA, G.LPs[sa]); gl.uniform4fv(U.u_LPB, G.LPs[sb]);
    gl.uniform4f(U.u_lead, wB, mixk(G.pre), mixk(K0) * (1 + 0.25 * gust), 0);
    gl.uniform4f(U.u_grow, mixk(W0), gr[1], gr[2], mixk(F0));
    const Q = BUF.Q, Qs = BUF.Qs;
    for (let i = 0; i < S.nQ; i++) { const r = S.qrects[i]; Q[i * 4] = r[0]; Q[i * 4 + 1] = r[1]; Q[i * 4 + 2] = r[2]; Q[i * 4 + 3] = r[3]; Qs[i] = r[4]; }
    gl.uniform4fv(U.u_Q, Q); gl.uniform1fv(U.u_Qs, Qs); gl.uniform1i(U.u_Qn, S.nQ);
    gl.bindVertexArray(S.quadVao);   // no attributes: every grain comes from its vertex id
    let drawn = 0;
    if (r1[1] > r1[0]) { gl.drawArrays(gl.POINTS, r1[0], r1[1] - r1[0]); drawn += r1[1] - r1[0]; }
    if (r2 && r2[1] > r2[0]) { gl.drawArrays(gl.POINTS, r2[0], r2[1] - r2[0]); drawn += r2[1] - r2[0]; }
    stats.nSDrawn = drawn;
  }
  function renderFrame() {
    const gl = S.gl, T = S.T, P = S.P, St = S.sets;
    if (!gl || !St || gl.isContextLost()) return;
    let q = null;
    if (S.timer && pending.length < 4) { q = gl.createQuery(); gl.beginQuery(S.timer.TIME_ELAPSED_EXT, q); }
    const A = S.sceneW / S.sceneH;
    // page mode: read the layout (and so the scroll) in the frame that draws with it, and move the
    // canvas to match
    let heroOn = true;
    if (PAGE) {
      const L = readLayout();
      if (!L) { if (q) gl.endQuery(S.timer.TIME_ELAPSED_EXT), gl.deleteQuery(q); return; }
      placeCanvas(L);
      readPageRects();
      const top = L.hero.y - S.view;
      heroOn = top < S.cssH + 8 && top + L.hero.h > -8;
    }
    S.heroOn = heroOn;
    const nA = heroOn ? Math.round(St.anch.n * S.frac) : 0, nF = heroOn ? Math.round(St.fly.n * S.frac) : 0;
    stats.heroDrawn = nA + nF;

    gl.bindFramebuffer(gl.FRAMEBUFFER, T.grain.fb);
    gl.viewport(0, 0, S.W, S.H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const draw = (prog, set, n, setId) => {
      if (!n) return;
      gl.useProgram(prog.p); setUniforms(prog); gl.uniform1ui(prog.u.u_set, setId);
      if (setId === 0 && S.intro && St.mark) {
        const m = Math.min(St.mark.n, St.anch.n);
        gl.bindVertexArray(St.mark.vao); gl.drawArrays(gl.POINTS, 0, m);
        const rest = Math.max(n, m);
        gl.bindVertexArray(set.vao); if (rest > m) gl.drawArrays(gl.POINTS, m, rest - m);
      } else { gl.bindVertexArray(set.vao); gl.drawArrays(gl.POINTS, 0, n); }
    };
    const mk = S.mask == null ? 7 : S.mask;
    if (mk & 2) draw(P.fly, St.fly, nF, 1);
    if (mk & 1) draw(P.anch, St.anch, nA, 0);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(S.quadVao);

    // bloom (the hero's grains only): quarter-res downsample then a separable blur, twice. With the
    // card off screen there is nothing to bloom, so it is skipped.
    const bloomOn = heroOn && (nA + nF) > 0;
    if (bloomOn) {
      gl.useProgram(P.down.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.b1.fb); gl.viewport(0, 0, T.b1.w, T.b1.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.grain.tex);
      gl.uniform1i(P.down.u.u_src, 0);
      gl.uniform2f(P.down.u.u_srcTexel, 1 / S.W, 1 / S.H);
      gl.uniform2f(P.down.u.u_dstRes, T.b1.w, T.b1.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(P.blur.p);
      gl.uniform1i(P.blur.u.u_src, 0);
      gl.uniform2f(P.blur.u.u_res, T.b1.w, T.b1.h);
      for (let pass = 0; pass < 2; pass++) {
        const sp = 1.6 * (pass + 1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.b2.fb); gl.bindTexture(gl.TEXTURE_2D, T.b1.tex);
        gl.uniform2f(P.blur.u.u_dir, sp / T.b1.w, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.b1.fb); gl.bindTexture(gl.TEXTURE_2D, T.b2.tex);
        gl.uniform2f(P.blur.u.u_dir, 0, sp / T.b1.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    // page mode: the stream goes in after the bloom, so it looks the same with the card on screen or not
    if (PAGE && (mk & 4)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.grain.fb);
      gl.viewport(0, 0, S.W, S.H);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      drawStream();
      gl.disable(gl.BLEND);
      gl.bindVertexArray(S.quadVao);
    }

    // composite: background, tone map, vignette, film grain
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, S.W, S.H);
    gl.useProgram(P.comp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.grain.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.b1.tex);
    const U = P.comp.u;
    gl.uniform1i(U.u_grain, 0); gl.uniform1i(U.u_bloom, 1);
    gl.uniform2f(U.u_res, S.W, S.H);
    gl.uniform1f(U.u_dpr, S.W / S.cssW);
    if (PAGE) {
      const h = S.L.hero;
      gl.uniform4f(U.u_xf, h.x, h.y - S.view, h.h, 0);
      gl.uniform2f(U.u_hero, h.w, h.h);
      gl.uniform3f(U.u_page, 1, h.r == null ? 28 : h.r, 220);
    } else {
      gl.uniform4f(U.u_xf, 0, 0, S.cssH, 0);
      gl.uniform2f(U.u_hero, S.cssW, S.cssH);
      gl.uniform3f(U.u_page, 0, 0, 0);
    }
    gl.uniform3f(U.u_pageBg, PAGE_LIN[0], PAGE_LIN[1], PAGE_LIN[2]);
    gl.uniform1f(U.u_transparent, O.transparent ? 1 : 0);
    gl.uniform1f(U.u_aspect, A);
    gl.uniform1f(U.u_time, simWrap());
    gl.uniform1f(U.u_exposure, LOOK.exposure * (S.float ? 1 : 2));
    // v5: the hand keeps its edges crisp: less glow round it
    const w = sceneWeights();
    gl.uniform1f(U.u_bloomAmt, bloomOn ? LOOK.bloom * (1 - 0.85 * w[1]) : 0);
    gl.uniform1f(U.u_film, O.transparent ? 0 : LOOK.film);
    const c = S.copy;
    gl.uniform4f(U.u_quiet, c.x0, c.y0, c.x1, c.y1);
    gl.uniform1f(U.u_quietAmt, S.intro ? sstep(S.tg, S.tg + TL.span, S.ti) : 1);
    // v5: the silk's pool of light (the hand stands in it too) moves to the sky behind the dunes as they
    // come, and their bodies come and go with the gust front
    const pl = S.lu.pool, dc = S.duneCam, ls = S.ls;
    let g0 = pl[0], g1 = pl[1], g2 = A >= 0.95 ? 0.62 : 0.36;
    const dunes = !!(dc && S.T.bake && S.looping && (ls.a === 2 || ls.b === 2));
    if (dunes) {
      const dg = DUNE_SKY(A, dc);
      g0 += (dg.glow[0] - g0) * w[2]; g1 += (dg.glow[1] - g1) * w[2]; g2 += (dg.glow[2] - g2) * w[2];
      gl.uniform4f(U.u_hglow, dg.hglow[0], dg.hglow[1], dg.hglow[2], dg.hglow[3] * w[2]);
      gl.uniform4f(U.u_body, 1, dc.horizon, ls.b >= 0 ? ls.t * 3.5 / ls.tr : -1, ls.b === 2 ? 1 : -1);
      gl.uniform1f(U.u_bakeA, dc.A);
    } else {
      gl.uniform4f(U.u_hglow, 0, 0, 1, 0);
      gl.uniform4f(U.u_body, 0, 0, -1, 0);
      gl.uniform1f(U.u_bakeA, A);
    }
    gl.uniform4f(U.u_tr, LOOP.front0, LOOP.front, LOOP.land0, LOOP.land);
    gl.uniform3f(U.u_glow, g0, g1, g2);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, dunes ? S.T.bake : null);
    gl.uniform1i(U.u_bake, 2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);

    if (q) { gl.endQuery(S.timer.TIME_ELAPSED_EXT); pending.push(q); }
    if (S.timer) {
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const qq = pending.shift();
        if (!gl.getParameter(S.timer.GPU_DISJOINT_EXT)) stats.gpu.push(gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(qq);
        if (stats.gpu.length > 600) stats.gpu.shift();
      }
    }
    stats.rendered = (stats.rendered || 0) + 1;
    if (!S.firstFrame) {
      S.firstFrame = true;
      requestAnimationFrame(() => { if (S.destroyed) return; try { O.onFirstFrame && O.onFirstFrame(); } catch (e) { console.error(e); } });
    }
  }

  /* ---------------- the intro clock */
  function introEnd() { return S.tg + TL.span; }
  function advanceIntro(dt) {
    if (!S.intro) return;
    S.ti += dt * S.rate;
    // v6: the intro settles into the hand if it is laid out before the gust (decided once, before any grain settles)
    if (!S.itgt && S.ti < S.tg && sceneReady(1)) S.itgt = 1;
    // the mark holds a little longer (at most 1.8 s) while the hand is still being laid out: on a slow
    // phone a longer logo is the same startup, where settling into the silk was a different one
    if (!S.itgt && S.rate === 1 && S.ti >= S.tg && S.ti < TL.tg + 1.8) S.tg = S.ti + 0.05;
    if (S.ti >= S.tg) phase('gust');
    else if (S.ti >= TL.land) phase('logo');
    if (S.ti >= introEnd()) finishIntro();
  }
  function finishIntro() {
    S.intro = false;
    freeMark();
    phase('settled');
    startLoop();
  }

  /* ---------------- the loop's clock (v5): silk, change, hand, change, dunes, change, silk ...
     S.ls: the scene now (a), the next (b, < 0 while holding), seconds into the hold (h) or the change
     (t), and the change's length (tr). A change starts only once the next scene is laid out, so a slow
     device holds the scene a little longer; a scene that could not be built is skipped (with no dunes
     the loop is silk, hand, silk ...; with neither, the silk stays). */
  const HOLD_SILK = { a: 0, b: -1, t: 0, h: 0, tr: 0 };
  function sceneReady(i) {
    const Sc = S.sets && S.sets.scenes;
    return i === 0 || !!(Sc && (i === 1 ? Sc.hand : Sc.dunes && S.T.bake));
  }
  /* v6 (Tayyib, 28 Sep: "remove the silk animation in the hero it should only be the hand into the
     desert dunes"): the loop is the hand and the dunes. The silk only holds until the hand is laid out
     (a slow device, or a big resize that rebuilt the grains), and never comes back after that. */
  function nextScene(a) {
    // dunesOnly (Ty, 10 Oct: "remove the hand animation one, just have the desert animation one ...
    // constant"): to the dunes once they are laid out, and they hold for good.
    if (O.dunesOnly) return !S.failed[2] ? 2 : 0;
    if (a === 0) return !S.failed[1] ? 1 : (!S.failed[2] ? 2 : 0);
    if (a === 1) return !S.failed[2] ? 2 : 1;
    return !S.failed[1] ? 1 : 2;
  }
  function trLength(a, b) { return b === 1 ? LOOP.tr[0] : (a === 1 && b === 2 ? LOOP.tr[1] : 3.5); }
  /* Each scene has its own clock, which starts again at CLOCK_BASE whenever another scene holds the
     card (a scene off screen can be at any time of its own): so no clock ever runs long enough for a
     32-bit float on the GPU to lose its fine steps, however long the page stays open. */
  function clock(k) { return S.simT - S.clkBase[k]; }
  function rebase(a) { for (let k = 0; k < 3; k++) if (k !== a) S.clkBase[k] = S.simT - CLOCK_BASE; }
  // the page-wide clock for the stream and the film grain: its motion only uses frequencies that are
  // multiples of 0.01 rad/s, so it can wrap every 200 pi seconds without a seam
  function simWrap() { return S.simT % 628.3185307179586; }
  // onScene, as a scene settles (its hold begins)
  function announce() {
    const name = S.ls.b < 0 ? SCENES[S.ls.a] : '';
    if (!name || name === S.sceneName) return;
    S.sceneName = name;
    try { O.onScene && O.onScene(name); } catch (e) { console.error(e); }
  }
  function hold(a) { S.ls = { a, b: -1, t: 0, h: 0, tr: 0 }; rebase(a); announce(); }
  function startLoop() {
    if (!LOOPS || S.looping || S.fallback || !S.gl) return;
    S.looping = true; S.lt = 0;
    hold(S.itgt === 1 && sceneReady(1) ? 1 : 0);
  }
  // back to the silk at once (new grains: the old scenes no longer match them)
  function toSilk() { if (S.looping) hold(0); }
  function advanceLoop(d) {
    if (!S.looping) return;
    S.lt += d;
    const ls = S.ls;
    if (ls.b < 0) {
      ls.h += d;
      const nx = nextScene(ls.a);
      // dunesOnly: straight onto the dunes the moment they are laid out, no change to watch (the host
      // keeps the canvas hidden until onScene('dunes'), so the silk is never seen).
      if (O.dunesOnly && nx === 2 && ls.a !== 2 && sceneReady(2)) { hold(2); return; }
      if (ls.h >= (ls.a === 0 ? 0 : LOOP.hold) && nx !== ls.a && sceneReady(nx)) { S.ls = { a: ls.a, b: nx, t: Math.min(ls.h - LOOP.hold, 0.05), h: 0, tr: trLength(ls.a, nx) }; }
    } else {
      ls.t += d;
      if (ls.t >= ls.tr) hold(ls.b);
    }
    // a rebuild of the grains held back by a resize happens as the silk settles (see resize)
    if (S.pendingGen && S.ls.b < 0) { S.pendingGen = false; generate(); if (PAGE) generateStream(); }
  }
  // the loop at loop time lt as it runs when every scene is ready in time (for testing): the state and
  // each scene's clock
  function loopAt(lt) {
    const simT0 = S.simT - lt, full = 3 * LOOP.hold + LOOP.tr[0] + LOOP.tr[1] + LOOP.tr[2];
    // (from the start of the loop before this one: far enough back for every clock to have been set)
    let t = Math.max(0, Math.floor(lt / full) - 1) * full, a = 0;
    if (t === 0) S.clkBase[0] = 0;
    for (let guard = 0; guard < 16; guard++) {
      for (let k = 0; k < 3; k++) if (k !== a) S.clkBase[k] = simT0 + t - CLOCK_BASE;
      if (lt < t + LOOP.hold) { S.ls = { a, b: -1, t: 0, h: lt - t, tr: 0 }; return; }
      const b = (a + 1) % 3, tr = LOOP.tr[a];
      if (lt < t + LOOP.hold + tr) { S.ls = { a, b, t: lt - t - LOOP.hold, h: 0, tr }; return; }
      t += LOOP.hold + tr; a = b;
    }
  }
  // how much each scene shows (silk, hand, dunes): for the sky's glow and the glow round the hand
  function sceneWeights() {
    const w = S.wts, ls = S.ls;
    w[0] = w[1] = w[2] = 0;
    if (!S.looping || ls.b < 0) { w[S.looping ? ls.a : (S.itgt ? 1 : 0)] = 1; return w; }
    const f = sstep(0.4, ls.tr - 0.3, ls.t);
    w[ls.a] = 1 - f; w[ls.b] += f;
    return w;
  }

  /* adaptive grain count: if frames get slow, draw a smaller (evenly shuffled) share, then lower the
     resolution, and if it is still hopeless, settle on a single still frame. A steady 30 Hz (a phone
     in Low Power Mode, a throttled tab) is the display's pace, not slowness, and is left alone; so is
     any slow cadence while the GPU's own time per frame (when the browser reports it) is small. */
  function recentGpu() {
    const g = stats.gpu;
    if (g.length < 10) return null;
    const s = g.slice(-30).sort((x, y) => x - y);
    return s[s.length >> 1];
  }
  function adapt(dtMs) {
    if (stats.frames < 20) return;
    // v5: a change draws two scenes for each grain in the air, so its frames are the loop's heaviest, and
    // they come round every few seconds: they are left out, so that they never ratchet the quality down
    if (S.looping && S.ls.b >= 0) { win = []; return; }
    win.push(dtMs);
    const span = win.reduce((a, b) => a + b, 0);
    if (win.length < 40 && span < 800) return;
    const s = win.slice().sort((a, b) => a - b), med = s[s.length >> 1], lo = s[Math.floor(s.length * 0.1)];
    win = [];
    if (med <= 20.5) {
      // v5: and it comes back, slowly: after about 10 s of quick frames, a few more grains
      S.quick = med < 12 && S.frac < 1 ? (S.quick || 0) + span : 0;
      if (S.quick > 10000) { S.quick = 0; S.frac = Math.min(1, S.frac * 1.15); stats.frac = +S.frac.toFixed(3); }
      return;
    }
    S.quick = 0;
    const gpu = recentGpu();
    if (gpu != null && gpu < 10) return;
    if (gpu == null && Math.abs(med - 33.33) < 1.5 && med - lo < 2.5) return;
    if (S.frac > 0.3) S.frac = Math.max(0.3, S.frac * (med > 40 ? 0.5 : 0.78));
    else if (!S.dprCap && S.dpr > 1.01) { S.dprCap = Math.max(1, S.dpr * 0.66); resize(false); }
    else if (med > 34 && !S.intro) {
      // v5: the still is a scene, never a moment mid-gust (the nearer of the two)
      if (S.looping && S.ls.b >= 0) S.ls = { a: S.ls.t < S.ls.tr * 0.5 ? S.ls.a : S.ls.b, b: -1, t: 0, h: 0, tr: 0 };
      stop(); S.still = true; renderFrame();
    }
    stats.frac = +S.frac.toFixed(3);
  }
  function loop(now) {
    S.raf = requestAnimationFrame(loop);
    const dt = S.lastNow ? now - S.lastNow : 16.7;
    S.lastNow = now;
    const d = Math.min(dt, 50) / 1000;
    S.simT += d;
    advanceIntro(d);
    advanceLoop(d);
    pumpScenes();
    if (PAGE) {
      if (!S.intro && S.amt < 1) S.amt = Math.min(1, S.amt + d / 1.6);
      if (S.G) S.pathPx = (S.pathPx + S.G.speed * d) % (S.Lcap || 1);
    }
    if ((++S.frames % 60) === 0) readRects();
    stats.frames++;
    stats.deltas.push(dt); if (stats.deltas.length > 600) stats.deltas.shift();
    // page mode with the card off screen: only the stream moves, slowly, so at most ~60 frames a
    // second (a 120 Hz display draws every other one). The canvas scrolls with the page by itself;
    // it is redrawn early only when the scroll nears the edge of what it covers.
    if (PAGE && !S.heroOn && !S.intro && S.lastRender && now - S.lastRender < 15 && S.L) {
      const L = readLayout();
      const t = viewFor(L), top = L.hero.y - t;
      if (Math.abs(t - S.view) < S.over * 0.5 && !(top < S.cssH + 8 && top + L.hero.h > -8)) { adapt(dt); return; }
    }
    S.lastRender = now;
    renderFrame();
    adapt(dt);
  }
  function canRun() { return S.ready && !S.running && !S.still && !S.fallback && S.gl && !O.reducedMotion && !document.hidden && !S.destroyed; }
  function start() {
    S.wantStart = true;
    if (!S.ready || S.destroyed) return;
    if (O.reducedMotion || S.fallback) { if (S.fallback) drawFallback(); else renderFrame(); phase('settled'); return; }
    if (!S.phase) phase(S.intro ? 'swirl' : 'settled');
    if (!S.intro) startLoop();
    if (!canRun()) return;
    S.running = true; S.lastNow = 0;
    S.raf = requestAnimationFrame(loop);
  }
  function stop() { S.wantStart = false; S.running = false; cancelAnimationFrame(S.raf); }
  function pause() { S.running = false; cancelAnimationFrame(S.raf); }
  function skipIntro() {
    if (!S.intro) return;
    if (S.ti < S.tg) { if (!S.itgt && sceneReady(1)) S.itgt = 1; S.tg = S.ti; S.rate = 1.9; phase("gust"); }
    else S.rate = Math.max(S.rate, 2.4);
  }

  /* ---------------- still fallback without WebGL2: the same sheet, drawn once in 2D */
  const LD = (() => { const v = [-0.35, -0.80, 0.42], l = Math.hypot(...v); return v.map((x) => x / l); })();
  const HV = (() => { const v = [LD[0], LD[1], LD[2] + 1], l = Math.hypot(...v); return v.map((x) => x / l); })();
  function shadeJS(Ly, u, v, t, p, pool, A) {
    const a = surfJS(Ly, u + 0.0008, v, t), b = surfJS(Ly, u, v + 0.003, t);
    const ux = a[0] - p[0], uy = a[1] - p[1], uz = a[2] - p[2], vx = b[0] - p[0], vy = b[1] - p[1], vz = b[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const diff = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]);
    const spec = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 40);
    const edge = v > 0 ? 1 - sstep(Ly.E[0], 1, v) : 1 - sstep(Ly.E[1], 1, -v);
    const px = (p[0] - pool[0]) / pool[2], py = (p[1] - pool[1]) / pool[3];
    const pl = 0.20 + 0.80 * Math.exp(-px * px - py * py);
    let proj = sstep(0.02, 0.62, nz); proj *= proj;
    const tr = A >= 0.95 ? sstep(0.50 * A, 0.90 * A, p[0]) * (1 - sstep(0.10, 0.46, p[1])) : sstep(0.5 * A, A, p[0]) * (1 - sstep(0.03, 0.2, p[1]));
    return Ly.M[0] * edge * pl * proj * (1 - 0.80 * tr) * (0.03 + 1.05 * Math.pow(diff, 1.3) + 0.95 * spec);
  }
  // page mode without WebGL2: the page colour, and the card's still moved with the scroll
  function blitFallback() {
    if (!S.fbCanvas) return;
    const L = readLayout();
    const ctx = S.ctx2d || (S.ctx2d = canvas.getContext('2d'));
    if (!L || !ctx) return;
    placeCanvas(L);
    const d = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(S.cssW * d), H = Math.round(S.cssH * d);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = `rgb(${PAGE_BG.join(',')})`; ctx.fillRect(0, 0, S.cssW, S.cssH);
    const h = L.hero, y = h.y - S.view, r = h.r == null ? 28 : h.r;
    if (y + h.h > 0 && y < S.cssH) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(h.x, y + h.h); ctx.lineTo(h.x, y + r); ctx.arcTo(h.x, y, h.x + r, y, r);
      ctx.lineTo(h.x + h.w - r, y); ctx.arcTo(h.x + h.w, y, h.x + h.w, y + r, r); ctx.lineTo(h.x + h.w, y + h.h); ctx.closePath();
      ctx.clip();
      ctx.drawImage(S.fbCanvas, h.x, y, h.w, h.h);
      const fade = ctx.createLinearGradient(0, y + h.h - 220, 0, y + h.h);
      fade.addColorStop(0, `rgba(${PAGE_BG.join(',')},0)`); fade.addColorStop(1, `rgba(${PAGE_BG.join(',')},1)`);
      ctx.fillStyle = fade; ctx.fillRect(h.x, y + h.h - 220, h.w, 220);
      ctx.restore();
    }
  }
  function drawFallback() {
    if (!S.grains) return;
    // (a canvas that already holds a WebGL context cannot draw in 2D: then nothing is drawn, onFirstFrame
    // never comes, and the host's poster stays)
    if (PAGE && !(S.ctx2d || (S.ctx2d = canvas.getContext('2d')))) return;
    const target = PAGE ? (S.fbCanvas || (S.fbCanvas = document.createElement('canvas'))) : canvas;
    const ctx = PAGE ? target.getContext('2d') : (S.ctx2d || (S.ctx2d = canvas.getContext('2d')));
    if (!ctx) return;
    const d = Math.min(2, window.devicePixelRatio || 1), sz = Math.max(1, Math.round(d));
    const W = Math.round(S.sceneW * d), H = Math.round(S.sceneH * d), SC = S.sceneH * d;
    target.width = W; target.height = H;
    const img = ctx.createImageData(W, H), acc = new Float32Array(W * H * 3);
    const A = S.sceneW / S.sceneH, layers = S.grains.layers, pool = layerUniforms(layers, A).pool;
    const quietAt = (x, y) => {
      let q = 0;
      for (const r of S.rects) {
        const f = 0.13, qx = sstep(r.x0 - f, r.x0, x) * (1 - sstep(r.x1, r.x1 + f, x));
        const qy = sstep(r.y0 - f, r.y0, y) * (1 - sstep(r.y1, r.y1 + f, y));
        q = Math.max(q, qx * qy * r.s);
      }
      return q;
    };
    const rand = mulberry32(7), t = STILL_T;
    for (const set of [S.grains.anch, S.grains.fly]) {
      for (let k = 0; k < set.n; k++) {
        const u = set.g[4 * k], v = set.g[4 * k + 1], Ly = layers[set.g[4 * k + 2] | 0], e = set.g[4 * k + 3];
        const p = surfJS(Ly, u, v, t);
        let lum = shadeJS(Ly, u, v, t, p, pool, A), x = p[0], y = p[1], a = 1;
        const jit = 0.75 + 0.5 * rand(), r = rand();
        if (e > 0.015 && r < Math.pow(e, 0.8) * 0.95) { // airborne: a straight drift up and to the left, barely rippled
          const s = rand() * 6, ease = Math.min(1, s / 2.2);
          x += -0.12 * s * ease + 0.004 * Math.sin(y * 7 + s * 0.9) * s;
          y += -0.072 * s * ease + 0.004 * Math.sin(x * 6 + 1.3) * s;
          a = Math.exp(-s * 0.24); lum *= 1.2;
        }
        lum *= 1 - quietAt(x, y);
        const X = Math.floor(x * SC), Y = Math.floor(y * SC);
        if (X < 0 || Y < 0 || X >= W - sz || Y >= H - sz) continue;
        const s1 = sstep(0.04, 0.5, lum), s2 = sstep(0.5, 1.05, lum);
        const r0 = 0.03 + 0.27 * s1, g0 = 0.10 + 0.38 * s1, b0 = 0.068 + 0.302 * s1;
        const m = (0.04 + lum) * jit * a * LOOK.gain * 1.25;
        const cr = (r0 + (0.95 - r0) * s2) * m, cg = (g0 + (0.87 - g0) * s2) * m, cb = (b0 + (0.69 - b0) * s2) * m;
        for (let yy = 0; yy < sz; yy++) for (let xx = 0; xx < sz; xx++) { const o = ((Y + yy) * W + X + xx) * 3; acc[o] += cr; acc[o + 1] += cg; acc[o + 2] += cb; }
      }
    }
    const px = img.data, enc = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    for (let i = 0, o = 0; i < W * H; i++, o += 3) {
      const r = 1 - Math.exp(-acc[o]), g = 1 - Math.exp(-acc[o + 1]), b = 1 - Math.exp(-acc[o + 2]);
      px[4 * i] = enc(0.004 + r); px[4 * i + 1] = enc(0.012 + g); px[4 * i + 2] = enc(0.008 + b); px[4 * i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (PAGE) blitFallback();
    if (!S.firstFrame) { S.firstFrame = true; try { O.onFirstFrame && O.onFirstFrame(); } catch (e) { console.error(e); } }
  }

  /* ---------------- boot */
  const onVis = () => { if (document.hidden) pause(); else if (S.wantStart) start(); };
  // the lost context's queries, bake and programs are gone with it (v5: forget them, or every frame warns)
  const forgetGL = () => { pending = []; stats.gpu.length = 0; S.job = null; S.bakeProg = null; S.duneCam = null; S.scenesOk = false; };
  const onLost = (e) => { e.preventDefault(); pause(); forgetGL(); };
  const onRestored = () => {
    try { forgetGL(); S.P = {}; S.T = {}; S.sets = null; S.W = S.H = 0; initGL(); resize(true); if (S.wantStart) start(); } catch (err) { console.warn('[grain] could not restore WebGL', err); }
  };
  // page mode: when nothing is animating (reduced motion, a still, stopped), redraw on scroll. The
  // canvas scrolls with the page, so this is only needed as the scroll nears the edge of what it
  // covers, and to keep the quiet zones of pinned (sticky) content in place.
  const onScroll = () => {
    if (S.running || !S.ready || S.destroyed || S.scrollRaf) return;
    S.scrollRaf = requestAnimationFrame(() => { S.scrollRaf = 0; if (S.destroyed) return; if (S.fallback) { if (S.L && Math.abs(viewFor(readLayout()) - S.view) >= S.over * 0.5) blitFallback(); } else renderFrame(); });
  };
  if (PAGE) addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  async function boot() {
    let ok = false;
    try { ok = initGL(); } catch (err) { console.warn('[grain] WebGL2 unavailable, drawing a still:', err.message); ok = false; S.gl = null; }
    if (!ok) { S.fallback = true; S.intro = false; }
    if (S.intro) {
      const img = await loadImage(O.handImageUrl);
      const box = img ? alphaBox(img) : null;
      S.hand = img && box ? { img, box } : { img: null, box: { x: 16, y: 20, w: 66, h: 72 } };
      const fam = (O.font || 'sans-serif').split(',')[0].trim();
      await fontReady(`600 64px ${fam}`, 900);
      if (S.destroyed) return;
    }
    S.ready = true;
    resize(true);
    if (S.wantStart) start();
  }
  boot();

  const api = {
    start, stop, skipIntro,
    resize: () => resize(false),
    destroy() {
      if (S.destroyed) return;
      stop(); S.destroyed = true;
      releaseSceneWorker();
      document.removeEventListener('visibilitychange', onVis);
      if (PAGE) removeEventListener('scroll', onScroll);
      cancelAnimationFrame(S.scrollRaf);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (S.gl) {
        pending.forEach((q) => S.gl.deleteQuery(q)); pending = [];
        if (S.job && S.job.bake) bakeEnd(S.job.bake, false);
        S.job = null;
        if (S.bakeProg) { S.gl.deleteProgram(S.bakeProg.p); S.bakeProg = null; }
        freeSets(); ['grain', 'b1', 'b2'].forEach((k) => freeTarget(S.T[k]));
        if (S.T.bake) S.gl.deleteTexture(S.T.bake);
        for (const k in S.P) S.gl.deleteProgram(S.P[k].p);
        S.gl.deleteVertexArray(S.quadVao);
      }
      S.gl = null;
    },
    get ready() { return S.ready; },
    /* testing only: render the frame at intro time ti (sheet clock follows), or at sheet time t */
    debug: {
      stats,
      seek(ti) { pause(); if (!S.gl) return false; S.intro = true; S.ti = ti; S.tg = TL.tg; S.rate = 1; S.simT = HERO_T0 + ti; if (!S.sets.mark) generate(); renderFrame(); S.gl.finish(); return true; },
      at(t) { pause(); if (!S.gl) return false; S.intro = false; S.simT = t; S.ls = { ...HOLD_SILK }; S.clkBase[0] = 0; if (S.G) S.pathPx = (S.G.speed * t) % S.Lcap; renderFrame(); S.gl.finish(); return true; },   // (the silk, as in v3)
      /* v5: render the loop at loop time lt (the sheet's clock follows) */
      loopAt(lt) { pause(); if (!S.gl) return false; S.intro = false; S.looping = LOOPS; S.lt = lt; S.simT = HERO_T0 + TL.tg + TL.span + lt; loopAt(lt); if (S.G) S.pathPx = (S.G.speed * S.simT) % S.Lcap; renderFrame(); S.gl.finish(); return true; },
      loop: () => ({ lt: S.lt, looping: S.looping, a: S.ls.a, b: S.ls.b, t: S.ls.t, tr: S.ls.tr, scene: S.sceneName, hand: sceneReady(1), dunes: sceneReady(2), failed: S.failed.slice(), pendingGen: S.pendingGen, job: S.job ? S.job.stage : '', scenesMs: stats.scenesMs, bakeMs: stats.bakeMs, round: stats.round, clocks: [clock(0), clock(1), clock(2)] }),
      stream: () => (S.G ? { Lb: S.G.Lb, Ltot: S.G.Ltot, Lcap: S.Lcap, y0: S.G.y0, end: S.G.end, R: S.G.R, pitch: S.G.pitch, Lturn: S.G.Lturn, LP: Array.from(S.G.LP), n: S.streamN, drawn: stats.nSDrawn, amt: S.amt, view: S.view, over: S.over, cssH: S.cssH, heroOn: S.heroOn } : null),
      state: () => ({ ti: S.ti, tg: S.tg, rate: S.rate, intro: S.intro, phase: S.phase, simT: S.simT, frac: S.frac, dpr: S.dpr, nLogo: stats.nLogo, logoE: S.logoE, mark: S.markLayout, running: S.running, still: S.still, view: S.view }),
      setFrac(f) { S.frac = f; },
      mask(m) { S.mask = m; },
    },
  };
  return api;
}

// Shared with the same-origin worker; the layout functions remain unchanged.
export { buildScenes };
