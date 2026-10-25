---
'@astryxdesign/core': patch
---

[chore] Internal: the gesture hooks follow their element and call nothing back after unmount, and turning `isEnabled` off mid-gesture ends the gesture without calling the listener from an Effect; `usePressTracker` takes `isBraking` and applies option changes from the next touch; the recognizer's arena plumbing is `protected`; `attachTapHaptic` gives focus straight back. Not exported from the package entry point; no component uses it yet.

@vjeux
