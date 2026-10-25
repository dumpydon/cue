# Live audio inputs

Two compact indicators share the transcription-status header, above Cue's answers
and next to **New chat**, without consuming an extra row of answer space:

- **You**, with a microphone icon and a centered waveform, follows microphone input.
- **Call**, with a monitor icon and rising level bars, follows system / meeting audio.

Both use the actual mono PCM already produced by the capture graph. The microphone
shows five short amplitude slices; Call shows five recent level readings. A quiet
noise floor stays flat. There is no random waveform, microphone test recording,
additional device acquisition, provider request, or stored audio introduced by the
meters. They indicate incoming sound, not successful transcription or speaker
identification; the existing transcription status remains separate.

Track mute/end and AudioContext suspension clear the affected meter independently.
Missing buffers settle within 450 ms. Ending a session clears both immediately,
and late speech events cannot reactivate the old listening dot. An unavailable or
disabled input uses a muted icon; hover describes the state. Reduced-motion mode
removes the short bar transitions, with no idle animation in either mode.

Call activity requires the existing meeting-audio capture to be enabled and
available. This display does not change permissions, enable capture, or bypass
the platform's system-audio requirements.

Validation: `test/audio-activity.test.js` covers level mapping, channel isolation,
silence, stalled buffers, track/context lifecycle, session reset, and cleanup.
`scripts/smoke-audio-context.cjs` sends synthetic microphone and loopback audio
through real Web Audio graphs, including AudioWorklet and ScriptProcessor paths,
and checks rendered meters, mute/recovery, opt-out/denied/missing inputs,
small-window live-call layout with multiline input, stop/restart, and
the final transcript. It uses a temporary profile and no physical inputs.
