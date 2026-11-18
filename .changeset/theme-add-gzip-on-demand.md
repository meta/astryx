---
'@astryxdesign/cli': patch
---

[perf] Commands that load the theme code no longer load gzip support, which only `theme add` needs to unpack a shared theme's `.tgz`. Most commands are about 2–3 ms faster, and every answer is unchanged.

@josephfarina
