# Chat sidebar

Open the sidebar with the panel icon beside the transcription status. It stays
beside the answer on wide windows and becomes a contained drawer on narrow ones.
The existing toolbar History popup and upper-right New chat button still work.

- **Chats:** search, open, rename, pin/unpin, and move to Trash using the row’s
  three-dot popup. It floats beside the row with Rename, Pin/Unpin and a red Delete
  action. Delete moves the item to Trash. Pinned chats stay first. New chat starts
  a separate saved thread.
- **Recordings:** read saved transcripts and notes in the answer area; rename or
  move them to Trash. A recording currently being captured cannot be renamed or
  removed. Back to chat returns to the current conversation.
- **Trash:** restore chats or recordings without losing their contents or memory.

The sidebar uses the existing local stores. Chat files gain an optional `pinnedAt`
field, and old files need no migration. It never changes model context or makes an
AI request. Open/closed state and the selected category are remembered locally.
Unsent composer text stays with its chat while switching within one app session;
these unsent drafts are kept only in renderer memory and do not survive quitting.

Lists initially render 40 entries and load more on demand. Recording transcripts
render 60 turns at a time. Busy answers block chat mutations, and stale asynchronous
loads cannot replace a newer view. The compact drawer supports Escape and keyboard
focus containment; answer shortcuts are disabled while browsing it or a recording.
The actions popup uses the browser top layer so it cannot be clipped by the list
or expand a row. It stays inside the panel, dismisses on outside click, Escape,
scroll, window resize or focus loss, and supports arrow keys, Home/End and Tab.

New icons were created with the built-in imagegen tool and used as tintable PNG
alpha masks. [Generation prompts](sidebar-icons.md).

Verification: `npm test`, `electron scripts/smoke-chat-sidebar.cjs`,
`node scripts/smoke-chat-threads.cjs`, and
`electron scripts/smoke-response-context.cjs`. The Electron suites use disposable
profiles and synthetic providers, never the installed app’s chats or credentials.
