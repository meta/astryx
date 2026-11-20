---
'@astryxdesign/cli': patch
---

[experimental] A run of one `astryx experimental` command loads only that command, as `astryx <command>` already does. `astryx experimental export` and `astryx experimental import` no longer load the theme editor first, so each run starts about 0.2 seconds sooner. `astryx experimental` alone, its help, and an unknown word still load every command, so they print the same answers.

@josephfarina
