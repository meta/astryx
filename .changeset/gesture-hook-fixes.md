---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture hooks call nothing back after unmount; `usePressTracker` brakes with the host by default and applies option changes from the next touch; the recognizer's arena plumbing is `protected`; `attachTapHaptic` gives focus straight back. Not exported from the package entry point; no component uses it yet.

@vjeux
