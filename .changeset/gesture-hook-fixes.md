---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture hooks call nothing back after unmount; `usePressTracker` brakes with the host by default and keeps one tracker, so an option change or a new ref never drops a press in progress; the recognizer's arena plumbing is `protected`. Not exported from the package entry point.

@vjeux
