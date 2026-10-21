# Particle background

The homepage uses the actual public Raised Hand grain engine, retrieved from
<https://raisedhand.ai/landing/grain-engine.js> on 21 October 2026, under the permission
stated by the user for this task. It is served locally; no Raised Hand scripts,
analytics, accounts, images, or network services are requested at runtime.

Original SHA-256: `1028d1c1ac5ecb3aaf732a3fb6f56786a76f027128c4aba9cd9075f0b0099d67`.

The source's dune field and camera, seeded grain sampling, crest wind, spiral and
Bezier trajectories, particle density, 90 px/s desktop and 70 px/s mobile stream
speeds, shaders, bloom, and adaptive rendering are retained. The `dunesOnly` option
matches Raised Hand's current homepage configuration.

Integration changes are limited to:

- Optional transparent compositing, so Cue keeps its existing black-and-blue
  background. The original opaque sky and whole-frame film noise are omitted.
- The original geometry builder runs in a same-origin module worker rather than
  a generated blob worker. The existing content security policy remains intact.
- A page-layout adapter measures Cue's hero and content. Content masks protect
  text and app previews; the original trajectory formulas are unchanged.
- Reduced-motion preferences freeze the first completed dune frame. The canvas
  stays hidden while the original geometry is being prepared. Devices without
  WebGL2 keep the existing page without this decorative layer.

Application previews, the launch film, website palette, text, and controls are
unchanged by this feature. All new files are confined to the website.
