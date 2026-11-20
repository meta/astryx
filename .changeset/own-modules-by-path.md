---
'@astryxdesign/cli': patch
---

[perf] In a project with an integration, `astryx` commands that keep what they gather (`component`, `search`, `template`, `docs`, `doctor` and others) load the installed CLI's own modules by their path in its folder, without Node first checking that each file exists and where it really lives, so they finish sooner.

@josephfarina
