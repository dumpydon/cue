# README media

These assets reuse Cue's existing launch film and isolated app screenshots.
No personal screen, microphone, meeting, or credentials were recorded.

- `cue-launch-preview.gif`: launch film, 5–26 seconds (21 seconds); opening Cue, incognito, Smart assist, window movement, and conversation context.
- `cue-conversation-preview.gif`: launch film, 22–30.5 seconds; conversation context and a coding answer.
- `cue-live-audio.png`: unchanged screenshot from `scripts/smoke-audio-context.cjs`,
  saved during the 0.4.15 release checks using synthetic microphone and loopback inputs.
- `cue-code-answer.png`: unchanged screenshot from `scripts/smoke-answer-format.cjs`,
  saved during the same release checks using a sample coding response.

The film and its illustrated interfaces are documented in
[`site/film-src/README.md`](../../site/film-src/README.md). Its original MP4,
soundtrack, captions, and poster remain unchanged. GIFs are silent, loop, and
respect GitHub's visitor-controlled animation preferences. The README links to
the full film for playback with sound and captions.

Recreate either GIF with FFmpeg; adjust `-ss` and `-t` to the range above:

```sh
ffmpeg -ss 5 -t 21 -i site/public/media/cue-launch.mp4 \
  -filter_complex 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle' \
  -loop 0 docs/media/cue-launch-preview.gif
```
