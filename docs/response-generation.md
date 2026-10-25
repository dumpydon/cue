# Response context and follow-ups

Cue saves typed questions, generated answers and explicit preferences in local
chat threads. **History → Chats** lets you create, rename, continue and delete a
chat. **Recordings** keeps live transcripts and notes separately. Delete moves
items to a recoverable **Trash**; removed recordings are excluded from meeting
memory and background notes. Existing recordings are kept without migration.
Older recordings are no longer automatically pruned after 50 sessions.

Each chat has its own file in the application's user-data `chats/` directory.
Writes use a 0600 temporary file, fsync and atomic rename. Requests are saved
before calling the provider; streamed drafts checkpoint at most every 700 ms,
and completed answers are saved immediately. Normal quit flushes pending drafts.
On restart, pending answers become **interrupted**; they remain readable but never
enter model context. A crash can lose the final uncheckpointed fraction of a
partial answer. Unreadable files are preserved and reported, not overwritten.
The catalog is rebuilt from chat files so a lost index cannot hide saved chats.

**New chat** archives the current conversation without ending live capture.
Switching or deleting chats is blocked during generation. Clearing the transcript
starts a fresh chat and invalidates late streaming events. Threads remember their
meeting mode; reopening restores that mode. Editing a mode/profile invalidates
older response context while preserving the readable archive. The current
request gets the latest mode/profile instructions. Deleted modes must be restored
before continuing their old chats.

Only completed, relevant text from the active thread is eligible for recall.
No screenshots, provider keys or entire provider request envelopes are stored in
chat files. User-supplied text is retained as typed. The renderer initially loads
30 exchanges and provides **Load earlier messages**, rather than rendering every
old code block at startup. History search matches names and latest previews.

## Memory and cost budget

The **Memory** button opens editable instructions and saved preferences for that
chat. A conservative local parser recognizes explicit statements such as “I prefer
DP questions in recursive form.” It excludes fenced code, quotations, credentials
and one-off requests. It does not infer all possible preferences or train model
weights. Users can add or correct any missed preference in the editor. Newer
preferences replace older ones in the same category; automatic memories expire
after 90 days. Manually edited preferences persist until removed. **Forget**,
**Forget all**, and an automatic-memory toggle give the user control. Preference
update turns are excluded from raw recall so forgotten preferences cannot return
through older messages. Existing global Style rules remain user-controlled; no
new automatic cross-chat memory is introduced.

A saved archive is not automatically sent to the model. For each request, Cue:

1. Counts the fresh system text and current user text locally with `o200k_base`.
2. Allows history plus memory to add at most **90% of that baseline**, with an
   absolute ceiling of **1,800 added tokens**, including message framing.
3. Prioritizes explicit preferences, the latest successful exchange and a relevant
   older exchange, with head/tail excerpts and visible omission markers when needed.
4. Keeps the current question intact and leaves the existing output ceilings unchanged.

This bounds **estimated text input to at most 1.9× a fresh request**, even after
50 or more long problems. The History detail shows the last request's estimate.
`o200k_base` is a local estimate for other providers, not their exact tokenizer.
This is not a guaranteed dollar multiplier: model-specific tokenization, image
input, answer length, reasoning, caching and pricing can differ. Cue does not
silently make summarization, embedding, title-generation or memory-extraction
API calls. Existing recording-note generation remains separate.

OpenAI's [conversation-state documentation](https://developers.openai.com/api/docs/guides/conversation-state)
explains that carrying provider-side conversation IDs still bills previous input
context. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
depends on model and prefix reuse; this budget does not assume a cache hit or change
cache billing options. Local storage itself incurs no API usage. It survives app
relaunch and replacement. Removing a macOS `.app` normally leaves its Application
Support data; there is no account or cloud-sync dependency.

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

## Sent messages

Pasted code and typed prompts retain indentation, tabs, blank lines and leading
spaces. Long messages show six rendered lines with **Show more / Show less**;
the preview adapts to the window width and text zoom. Text is selectable without
dragging the overlay. Use the usual copy shortcut or right-click **Copy** for a
selection, or the message's **Copy** button for its entire contents, including
collapsed lines. Prompts are displayed as literal text rather than active HTML.

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

- `node scripts/smoke-chat-threads.cjs` runs two fresh Electron processes with one
  temporary profile: rename, memory edits, 50-problem budget, isolation, recording
  deletion/restoration, pagination and interrupted-stream recovery.
- `npm test` includes durable-store, corruption, memory expiry/override, token-budget, and deterministic question-selection, speaker attribution,
  bounded history, category switching, and reset tests.
- `electron scripts/smoke-response-context.cjs` exercises real main/preload/
  renderer routing with a synthetic provider: follow-ups, reset, mode isolation,
  failure handling, no-evidence gates, output ceilings, and stale completions.
- `electron scripts/smoke-audio-context.cjs` exercises synthetic microphone and
  loopback PCM through AudioWorklets and speech events, preserving final words
  and separate speaker attribution into response prompts.
- `electron scripts/smoke-user-messages.cjs` covers pasted-code whitespace,
  expansion, exact full-message and selected-text copy, pointer selection,
  resizing/zoom, safe literal rendering and scrolling during generation.
- Existing answer-format and meeting-mode smoke tests cover readable output,
  minimum window layout, and editor/context integration.

The smoke tests use temporary profiles and synthetic sources. They do not access
personal transcripts, API credentials, the physical microphone, or real provider
accounts. They verify context delivery and behavior, not a measured uplift in a
particular model's answer quality. This change concerns text responses to audio;
it does not add text-to-speech playback.
