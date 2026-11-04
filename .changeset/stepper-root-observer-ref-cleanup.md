---
'@astryxdesign/core': patch
---

[chore] Internal: a horizontal Stepper stops measuring its list from the cleanup that the list's ref callback returns, not from an Effect. It still measures before the first paint, and it still stops when the list detaches or the Stepper turns vertical. Nothing a consumer imports or renders changes.

@cixzhang
