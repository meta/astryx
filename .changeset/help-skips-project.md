---
'@astryxdesign/cli': patch
---

[perf] In a project where no integration can load (no Astryx config, no integration manifest of its own, and no installed dependency that ships one), help and commands that don't need the project no longer load it first just to read the commands integrations declare: `--help`, `manifest` and `blog` answer about 65 ms sooner. Output is unchanged.

@josephfarina
