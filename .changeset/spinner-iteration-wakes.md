---
'@astryxdesign/core': patch
---

[fix] Spinner: a turning ring now wakes the main thread once every 100 turns instead of every turn. In a React app, Chromium recalculated style at the end of each turn, about seven times a second with one ring at a 525 ms turn. The ring looks and turns the same, and reduced motion still slows it to 3 seconds a turn.

@cixzhang
