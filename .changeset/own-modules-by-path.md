---
'@astryxdesign/cli': patch
---

[perf] In a project with an integration, `astryx` commands that keep what they gather (`component`, `search`, `template`, `docs`, `doctor` and others) load the installed CLI's own modules by their path in its folder instead of checking each one on disk, so they finish sooner.

@josephfarina
