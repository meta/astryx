---
'@astryxdesign/cli': patch
---

[perf] `astryx manifest` reads the manifest stored in the package when it is published, instead of loading every command to build it. The stored manifest is what the fully loaded CLI builds, and the publish step checks it is the same wherever the CLI runs, so `manifest` prints the same output.

@josephfarina
