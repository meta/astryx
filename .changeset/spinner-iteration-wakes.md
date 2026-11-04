---
'@astryxdesign/core': patch
---

[fix] Spinner: a turning ring no longer wakes the main thread. In a React app, Chromium recalculated style about seven times a second for each spinning ring. Now it does no main-thread work while the ring turns. The ring looks and turns the same, and reduced motion still slows it to 3 seconds a turn.

@cixzhang
