# Response context and follow-ups

Typed questions now include the current answer thread's completed user/assistant
pairs. For example, after Cue explains retry backoff, “make that shorter” or “show
the code” can refer to the actual preceding answer. Spoken “What should I say?”
and “Answer this” actions use captured conversation as evidence instead of assuming
that an earlier generated draft was spoken aloud. Recap and screen-code actions
receive their own task context; recaps never enter the answer thread.

The thread is memory-only, limited to six exchanges and 24,000 text characters.
It never retains screenshots or credentials. A new active meeting mode, edited
active context/profile, new meeting, or cleared transcript invalidates it. The
**New thread** button clears Cue's answer feed and answer memory while retaining
the live transcript. It is disabled during generation. A reset invalidates late
completions, so an old request cannot repopulate a cleared conversation.

For a selected speech question, Cue matches the question against captured turns,
including contiguous chunks from the same speaker, and includes up to ten turns
leading to that point. Later speech is excluded when a match is found. If edited
question text cannot be matched, recent captured context is supplied as reference
and the explicit selected question remains the target. Still-speaking text is
labelled provisional. Text context is bounded with explicit omission markers.

Question classification prioritizes the selected/typed question or the most recent
interviewer question. Short referential follow-ups can inherit the nearest topic;
unfinished contiguous speech chunks can form one question. Older behavioral
questions no longer dominate a new technical or compensation question.

All conversational actions distinguish generated drafts from actual evidence,
preserve names, numbers and negation, and request clarification or placeholders
when personal facts are missing. “What should I say?” requires a transcript;
screen-code requires a screenshot; Smart assist requires screen or conversation
context. Empty and failed provider responses are not added to thread memory.

## Output ceilings

These are visible-output ceilings passed to the provider adapter. Prompts still
request concise answers. Provider adapters retain their existing reasoning-token
headroom and model selection behavior.

| Action | Fast | Smart |
| --- | ---: | ---: |
| Spoken reply / selected audio question | 768 | 1,200 |
| Ask / Smart assist | 2,200 | 4,500 |
| Screen coding solution | 4,096 | 6,144 |
| Recap | 1,800 | 2,800 |

## Regression checks

- `npm test` includes deterministic question-selection, speaker attribution,
  bounded history, category switching, and reset tests.
- `electron scripts/smoke-response-context.cjs` exercises real main/preload/
  renderer routing with a synthetic provider: follow-ups, reset, mode isolation,
  failure handling, no-evidence gates, output ceilings, and stale completions.
- `electron scripts/smoke-audio-context.cjs` exercises synthetic microphone and
  loopback PCM through AudioWorklets and speech events, preserving final words
  and separate speaker attribution into response prompts.
- Existing answer-format and meeting-mode smoke tests cover readable output,
  minimum window layout, and editor/context integration.

The smoke tests use temporary profiles and synthetic sources. They do not access
personal transcripts, API credentials, the physical microphone, or real provider
accounts. They verify context delivery and behavior, not a measured uplift in a
particular model's answer quality. This change concerns text responses to audio;
it does not add text-to-speech playback.
