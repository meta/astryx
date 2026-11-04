---
'@astryxdesign/core': patch
---

[fix] `useLongPress` times a hold on the touch events' own timestamps (`spec:AST-094` FR16). When a busy page handles the lift late, a finger held for the full delay still reports its long press before the lift acts, instead of losing it, so a ContextMenu's long press opens on a loaded page too. A touch the page handled late no longer lengthens the hold, and a lift stamped before the deadline still cancels the press when its timer ran late. `onTouchEnd` and `onTouchCancel` take the touch event, optionally; spreading the handlers passes it.

@vjeux
