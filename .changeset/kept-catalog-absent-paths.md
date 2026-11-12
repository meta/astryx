---
'@astryxdesign/cli': patch
---

[perf] Checking whether a kept search catalog is still fresh no longer builds an error for each absent path it looked up, so warm `search` and `build` start a little faster. Every answer is the same.

@josephfarina
