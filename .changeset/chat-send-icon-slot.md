---
'@astryxdesign/core': patch
---

[feat] A theme can now map `ChatSendButton`'s send glyph through `componentIcons['chat-send-button-send']`, to another shared icon name or to `null`, without changing `arrowUp` for its other users, such as the sortable Table's ascending indicator. An explicit `sendIcon` still wins, and with no mapping the button shows `arrowUp` as before.

@cixzhang
