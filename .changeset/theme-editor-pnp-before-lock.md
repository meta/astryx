---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental theme` refuses a Yarn Plug'n'Play app with its Plug'n'Play fix before it takes a lock, so `new` and `set` no longer fail on a lock folder inside Yarn's read-only package archive.

@josephfarina
