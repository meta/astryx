---
'@astryxdesign/core': patch
---

[feat] Let themes map ChatSendButton's send glyph through `componentIcons['chat-send-button-send']` without changing other `arrowUp` users. A name replaces the glyph and `null` hides it without changing the control. An explicit `sendIcon` wins. `sendIcon={null}` previously showed `arrowUp` and now hides the glyph. To keep `arrowUp` when no theme mapping is set, omit `sendIcon` or pass `undefined`. Stop artwork is unchanged. Size-aware send entries receive the Button's contextual `sm` icon size instead of the standalone `md` request; pass `sendIcon` to keep explicit artwork.

@korkt-kim
