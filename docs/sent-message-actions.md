# Sent message actions

Long sent prompts show six rendered lines, then **Show more** with a down
chevron. Expanding shows the complete literal text and changes the control to
**Show less** with an up chevron. Code spacing, tabs and blank lines are preserved.

Copy and Edit are small outline icons below the bubble. They appear on hover or
keyboard focus; on devices without hover they remain visible. Their space is
reserved so moving the pointer does not shift the conversation. There is no Share
action. Copy always copies the complete message, including collapsed lines.

Edit loads an exact copy into the composer. Cancel or Escape returns to the prior
unfinished draft. Sending appends the revised prompt through the normal answer
path and restores that draft; the original exchange remains saved. Switching to
another chat exits editing and preserves the original draft in its chat. Editing
is disabled during answer generation, and live transcription cannot fill an edit.
Copying or opening Edit makes no AI request.

The Copy, Pencil and Chevron are code-native outline icons in the app’s existing
icon system. The request explicitly allowed reproducing these simple glyphs
directly. `scripts/smoke-user-messages.cjs` exercises hover/focus visibility,
editing and resending, draft preservation, chat restoration, expansion,
clipboard failures, literal text safety, selection and scrolling.
