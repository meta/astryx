---
'@astryxdesign/core': patch
---

[fix] `CodeBlock`'s and `Timestamp`'s copy buttons no longer update after they unmount: a clipboard write that finishes once the control is gone sets no state, starts no timer and announces nothing.

@cixzhang
