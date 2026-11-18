---
'@astryxdesign/cli': patch
---

[perf] `search`, component lookups, `build`, `doctor`, `integration` and `theme list` no longer load Node's zlib module, which they never use; `theme add` loads it only to unpack a shared theme's `.tgz`. Those commands are about 2 ms faster, and every answer is unchanged.

@josephfarina
