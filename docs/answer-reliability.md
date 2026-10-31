# Answer, voice and screen reliability

This development update adds bounded work and recovery around the existing answer
quality and memory pipeline. It does not make a crash-free guarantee or retrain models.

## Requests and partial answers

- The renderer waits for main-process admission before clearing a submitted draft.
  A busy or rejected request keeps its text. Enter while generating preserves the
  next draft; the Send button becomes **Stop** for the active answer.
- A single answer owns one cancellation signal across mode preparation, screen
  capture and the provider transport. Stop, context reset, quit and renderer loss
  cancel that operation. Late tokens cannot populate a newer chat or answer.
- Mode preparation has a 10-second deadline. The answer operation has a three-minute
  total deadline, including preparation. Streaming allows 60 seconds for first
  activity and 25 seconds of inactivity after visible output. Valid provider
  progress refreshes the inactivity timer; the total deadline remains fixed.
- Provider output is capped at 100,000 visible characters. An interrupted, cancelled
  or failed partial answer remains readable and copyable, and is excluded from recall.
  A provider error no longer overwrites already received code with an error message.
- The renderer reconciles busy state with main instead of unconditionally unlocking
  after 40 seconds. This avoids overlapping a valid long-running answer.
- Cancellation closes supported client transports. Work already accepted and billing
  after client disconnection remain provider-specific. There is no automatic replay
  of a partly generated paid answer.

## Capture and transcription

- Screen capture has an eight-second overall deadline; macOS native capture is
  killed after four seconds. Temporary screen PNGs are removed on errors as well
  as success. Native capture uses one main display, avoiding untracked extra PNGs.
- The display under the pointer is selected by display ID. On macOS, other displays
  use Electron capture. Capture thumbnails are bounded rather than allocating full
  Retina images for every monitor. Images retain the 1568-pixel long-edge target
  and JPEG quality 70 when they fit; unexpectedly large images are reduced until
  the encoded payload fits the three-MiB limit or are rejected.
- A stalled Electron capture cannot accumulate overlapping fallback jobs. Typed
  questions remain usable when no image is available; screen-only actions report
  the capture failure rather than inventing an answer from missing evidence.
- Batch speech requests have a 20-second overall deadline and receive a cancellation
  signal. Audio backlog is capped at 20 seconds per channel. Old queued batch audio
  is discarded with a visible warning if the provider cannot keep up.
- Local Whisper queues at most four utterances. Overload reports that some incoming
  audio was skipped and suggests a faster model; it does not silently switch to cloud
  speech. Forced stop also suppresses late inference results.
- OpenAI and Deepgram sockets stop accepting audio after one MiB of buffered writes
  and report backpressure through the existing fallback/error path. Gemini Live
  retains its existing bounded reconnect queue; its SDK owns the connected transport.
- A failed OpenAI speech item is retired from the ordering queue so subsequent
  completed sentences can continue. A recoverable item failure warns about that
  segment instead of restarting both live inputs.
- Invalid, empty, odd-length or oversized PCM IPC packets are ignored before native
  level analysis, resampling and transcription. Only the main Cue renderer can send them.

## Rendering and recovery

- The toolbar pin switches between this desktop and all desktops. The default
  is one macOS Space, with full-screen following off. The preference is saved
  through a dedicated IPC action so a stale settings snapshot cannot overwrite
  it. This does not change screen-share protection, capture or window geometry.
- Long streaming answers render less frequently and defer expensive highlighting
  for code blocks above 8,000 characters. Final answers retain the existing syntax
  highlighting up to its normal 60,000-character code-block limit.
- Live chat-title and memory updates send metadata rather than archived answers.
  Inference uses immutable text references, and history pages clone only their
  requested 30 exchanges instead of the complete archive.
- Renderer loss aborts the active answer, stops microphone/call transcription,
  checkpoints available text and reloads the answer window. Capture remains paused
  until the user explicitly starts it again. Recovery permits two attempts within
  one minute, then asks for a manual restart instead of entering a reload loop.
- This recovers isolated renderer failures, not a killed main process, an OS crash,
  failed hardware or every possible provider defect. Existing durable chat checkpoints
  are still the fallback after a whole-process restart.

## Verification

`npm test` covers cancellation/deadlines, actual local HTTP connection closure,
PCM and socket limits, slow local speech queues, failed-item ordering, screen
selection/timeouts, final formatting, and the existing context/cost constraints.

`electron scripts/smoke-answer-reliability.cjs` uses accelerated deadlines, an
isolated profile, synthetic audio/screen and a mock model. It tests concurrent
submission, kept drafts, Stop, late tokens, stalled/oversized responses, slow
healthy progress, preparation/capture hangs, simultaneous mic/call audio, an
actual forced renderer crash, saved partial answers and a successful next query.
It neither records physical sources nor calls a paid provider. It establishes
recovery behavior, not a measured improvement in a model's semantic answer quality.

Existing answer-format, user-message, response-context, chat restart, audio-context,
window/protection and shortcut interaction suites remain relevant regression checks.
`electron scripts/smoke-workspace-visibility.cjs` checks the real native workspace
flag, both toolbar modes, rapid clicks, saved preference, reload, compact layout
and independence from capture and protection.
