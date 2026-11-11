---
'@astryxdesign/core': patch
---

[fix] `useStreamingText` keeps where its reveal restarts in state. A render React discards, as a suspended transition does, no longer restarts a streaming reveal from the start or jumps it to the end.

@vjeux
