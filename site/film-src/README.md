# Cue launch film — photographic production edit

The replacement is **19 seconds, 1920 × 1080, 60 fps**, with H.264 High video and AAC audio. It uses the same photographed laptop, white studio backdrop, native SF typography, and soundtrack as the owner's explicitly authorized public Glee film. Every displayed Cue screen, conversation, code example, mode panel, and end card is synthetic and created by this source. The rejected drawn laptop film is no longer the production source.

## Production source

The source is the owner's public [Glee launch film](https://github.com/dumpydon/glee/blob/main/docs/media/glee-launch.mp4). Its recorded SHA-256 is `facd89a7e49ba1aeed09cbd916d0726e108b7c4988e067f7776741283493e625`; the exporter rejects a different source. Glee's `docs/media/README.md` and `script/create_launch_video.py` document that production edit.

Glee's public 19-second edit is the hardware source. The separate Downloads production candidate ending in another brand is **not** an input to this edit. The Glee reference provided the native font configuration and presentation direction. Glee-specific screens, lid-related copy, title, and repository link are replaced or omitted. The original approved Glee AAC soundtrack is copied without transcoding.

## Reproduce

Use macOS with SFNS.ttf and SFNSMono.ttf, FFmpeg, and Python 3.12. From Cue root:

```sh
python3.12 -m venv site/film-src/.venv
site/film-src/.venv/bin/pip install -r site/film-src/requirements.txt
CUE_FILM_MASTER=/path/to/glee/docs/media/glee-launch.mp4 node site/film-src/export.mjs --frames-only
CUE_FILM_MASTER=/path/to/glee/docs/media/glee-launch.mp4 node site/film-src/export.mjs
```

Alternatively invoke the Python script directly:

```sh
site/film-src/.venv/bin/python site/film-src/create_launch_video.py --master /path/to/glee/docs/media/glee-launch.mp4
```

The first run calculates screen-plane tracking and saves `tracking.json`. `--retrack` recalculates it. The tracked file permits deterministic reproduction from the same approved master. The exact original source SHA-256 is recorded in `site/film.json`. `PYTHON_BIN` overrides the Node wrapper's interpreter; `FFMPEG_BIN` overrides the `ffmpeg` executable in the Python source.

`frame_at(frame_number, original_frame, tracking)` defines every output frame. The renderer does not use wall-clock animation or random input. PIL draws Cue's UI with actual SFNS/SFNSMono text. OpenCV tracks and composites the new entire display plane into the photographic hardware shots. FFmpeg receives all 1140 frames and copies the approved audio stream. The final extreme source zoom is omitted to avoid unstable screen tracking; Cue's end card has a longer hold.

## Outputs and sequence

- `site/public/media/cue-launch.mp4` — fast-start H.264/yuv420p, AAC stereo.
- `site/public/media/cue-launch-poster.jpg` — photographic laptop with Cue screen.
- `site/public/media/cue-launch.vtt` — matching captions.
- `site/film.json` — actual bytes, SHA-256, format and production provenance.
- `site/film-src/previews/encoded-contact-sheet.jpg` — review frames extracted from the encoded movie (local review artifact, not a published asset).

| Time | Content |
| --- | --- |
| 0–4.85 s | Real laptop opening and camera push-in, synthetic Cue screen |
| 4.85–8 s | Screen + mic + Them; complete synthetic You/Them conversation |
| 8–10.9 s | Complete syntax-colored Python sliding-window solution |
| 10.9–13.8 s | Modes, provider/model choice and dotted incognito borders |
| 13.8–15.5 s | Photographic laptop return with Cue code and product copy |
| 15.5–19 s | Cue title and cue.dumpydon.workers.dev |

Incognito requests screen-share protection; the film states that capture behavior varies by app and platform. It does not claim undetectability or imply closed-lid operation. No actual system audio, microphone, screen, profile, transcript, secret, or user data was captured. The film does not make a system audio compatibility claim.

## Verification

```sh
/opt/homebrew/bin/ffprobe -v error -show_streams -show_format -of json site/public/media/cue-launch.mp4
/opt/homebrew/bin/ffmpeg -v error -i site/public/media/cue-launch.mp4 -f null -
```

The film is illustrative. Supported features are represented deliberately rather than recorded from a live app. The inherited hardware footage is limited to the source master's 1080p detail. Fonts and photo rasterization can vary slightly with host/library versions; the supplied package pins match the render setup.
