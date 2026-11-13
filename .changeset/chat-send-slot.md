---
'@astryxdesign/core': patch
---

[fix] Let themes map ChatSendButton's send glyph through `componentIcons['chat-send-button-send']` without changing other `arrowUp` users. A name replaces the glyph and `null` hides it without changing the control. Non-null `sendIcon` still wins; null or undefined uses the slot and then `arrowUp`. Stop artwork is unchanged. Size-aware send entries receive the Button's contextual `sm` icon size instead of the standalone `md` request; pass `sendIcon` to keep explicit artwork.

@korkt-kim
