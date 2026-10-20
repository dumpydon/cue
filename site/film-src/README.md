# Cue launch film

The film is **34 seconds, 1920 × 1080, 60 fps**, with H.264 High video and AAC stereo audio. It combines the owner's photographed Glee laptop opening and return shots with a deterministic, synthetic Google Meet → LeetCode → Cue demonstration. Native SF typography, the white studio presentation, the two approved feature layouts, and the closing card carry through the edit.

## Production sources

The hardware and music source is the owner's public [Glee launch film](https://github.com/dumpydon/glee/blob/main/docs/media/glee-launch.mp4). Its SHA-256 is `facd89a7e49ba1aeed09cbd916d0726e108b7c4988e067f7776741283493e625`; the exporter rejects a different source. The source is 19 seconds long. Its music is extended with a 1.25-second crossfade and a final fade, then encoded as 48 kHz AAC stereo.

The Google Meet mark comes from the local compatibility logo asset documented in [the asset notices](../THIRD_PARTY_ASSETS.md). All names, meeting views, Spotlight results, problem/editor interfaces, Cue windows, and responses are synthetic illustrations. No live meeting, screen, microphone, credentials, or personal data is captured.

## Reproduce

Use macOS with SFNS.ttf and SFNSMono.ttf, FFmpeg, and Python 3.12. From Cue root:

```sh
python3.12 -m venv site/film-src/.venv
site/film-src/.venv/bin/pip install -r site/film-src/requirements.txt
CUE_FILM_MASTER=/path/to/glee/docs/media/glee-launch.mp4 node site/film-src/export.mjs --frames-only
CUE_FILM_MASTER=/path/to/glee/docs/media/glee-launch.mp4 node site/film-src/export.mjs
```

`PYTHON_BIN` overrides the wrapper's interpreter and `FFMPEG_BIN` overrides FFmpeg. `--retrack` recalculates the supplied display-plane tracking for the approved hardware source. `--frames-only` exports review stills and the poster without encoding the movie.

`create_launch_video.py` owns the 2,040-frame timeline, photographed display compositing, feature layouts, typography, audio edit, encoding, and integrity metadata. `interview_scene.py` draws the synthetic desktop and cursor sequence. Every output frame is determined by its frame number; animation does not depend on wall-clock time or random input. Syntax-colored code uses a shared text baseline so punctuation and token colors remain aligned.

## Sequence

| Time | Content |
| --- | --- |
| 0–4.85 s | Photographed laptop opening; Google Meet is underway on the display |
| 4.85–7.2 s | Open LeetCode 42, Trapping Rain Water; Meet becomes a floating window |
| 7.2–10 s | Open Spotlight, search for Cue, launch the app |
| 10–14 s | Cue opens; the animated cursor switches the eye control to incognito |
| 14–18 s | Smart assist uses the problem on screen and reveals a two-pointer answer |
| 18–22 s | Screen + mic + interviewer; both sides of the conversation in context |
| 22–26.5 s | A clear solution. Right on cue; complete, syntax-colored Python code |
| 26.5–29.3 s | Modes, provider/model choice, and incognito controls |
| 29.3–31 s | Photographed laptop return and product copy |
| 31–34 s | Cue title and website |

The eye toggle illustrates a change from visible to incognito. The real app opens in incognito by default. Incognito requests native capture protection; behavior varies by app and platform, as the film and surrounding website state.

## Outputs and verification

- `site/public/media/cue-launch.mp4` — fast-start H.264/yuv420p, AAC stereo.
- `site/public/media/cue-launch-poster.jpg` — photographed laptop with the illustrated meeting.
- `site/public/media/cue-launch.vtt` — timed English captions.
- `site/film.json` — bytes, SHA-256, duration, frame count, and provenance.
- `site/film-src/previews/` — ignored local review frames and encoded contact sheet.

```sh
ffprobe -v error -show_streams -show_format -of json site/public/media/cue-launch.mp4
ffmpeg -v error -i site/public/media/cue-launch.mp4 -f null -
```

Review the encoded output at the tab switch, Spotlight search, eye click, screenshot click, answer reveal, both feature slides, and closing transitions. Hardware footage retains the detail of the authorized 1080p master.
