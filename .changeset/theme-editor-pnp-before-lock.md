---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme` refuses a Yarn Plug'n'Play app with its Plug'n'Play fix before any command takes a lock, so `new`, `set` and the other editor commands no longer fail on a lock folder inside Yarn's read-only package archive, and no cache is written there.

@josephfarina
