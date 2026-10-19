# Cue — original launch film

A 27-second, 1920 × 1080, 30 fps original film. The laptop, desktop wallpaper,
all conversation content, UI panels, typography, camera movement, and sound are
generated from this source. The only existing visual asset is Cue's own
`renderer/assets/cue-mark.svg`, copied here as `cue-mark.svg`.

No competitor footage, stock music, real screen captures, user transcripts,
credentials, or network requests are used.

## Reproduce

From the Cue repository root, with its existing Electron installation and FFmpeg:

```sh
node site/film-src/export.mjs --frames-only
node site/film-src/export.mjs
```

Outputs:

- `site/public/media/cue-launch.mp4` — H.264 High / yuv420p, AAC stereo, fast-start.
- `site/public/media/cue-launch-poster.jpg` — 1600 × 900 poster.
- `site/film.json` — exact MP4 size and checksum used for reliable byte ranges.
- `site/film-src/previews/` — six uncompressed keyframes and poster for review.

`--draft` creates a 1280 × 720 version named `cue-launch-draft.mp4`.
`ELECTRON_BIN` and `FFMPEG_BIN` can override the default executable locations.
The FFmpeg default is `/opt/homebrew/bin/ffmpeg`.

`stage.js` exposes `renderFrame(seconds)`. Every animation derives from the
supplied time, without live timers or random inputs. `render.cjs` renders 810
frames through the local Electron canvas into FFmpeg. `export.mjs` first creates
the quiet original oscillator soundtrack. Exact font rasterization can vary with
the host OS; the default typefaces are Helvetica Neue / Arial and SF Mono / Menlo.

## Sequence

| Time | Composition |
| --- | --- |
| 0–4.9 s | Close-up of original hardware and synthetic conversation |
| 4.45–9.35 s | Full-laptop pullback and core Cue line |
| 8.9–14.85 s | Code with syntax colors and logarithmic complexity |
| 14.4–19.45 s | Provider choice and context inputs |
| 19–23.35 s | Dotted incognito border and screen-share protection request |
| 22.9–27 s | Cue end card |

Transitions overlap. The UI is a stylized illustration of supported features,
not a literal recording of app behavior. Incognito says that Cue *requests*
screen-share protection; it does not promise undetectability. The on-film note
states that capture behavior varies by application and platform.

For web playback, start muted and inline. Respect reduced-motion preferences;
offer play/pause and an explicit sound toggle. The audio contains no narration,
so all product meaning is also present visually.

## Verify

```sh
/opt/homebrew/bin/ffprobe -v error -show_streams -show_format -of json site/public/media/cue-launch.mp4
/opt/homebrew/bin/ffmpeg -v error -i site/public/media/cue-launch.mp4 -f null -
```

Keyframe review uses `previews/contact-sheet.png`; it is a review artifact rather
than a public website asset. Rendering caches and WAV intermediates are ignored.
