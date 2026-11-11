---
'@astryxdesign/cli': patch
---

[perf] `astryx manifest` reads the manifest stored in the package when it is published, instead of loading every command to build it. The stored manifest is what the fully loaded CLI builds, and the publish step checks it is the same beside each package manager's lockfile, so while every command loads `manifest` prints the same output. A command whose module fails to load is listed in the published manifest under its normal entry, instead of being marked as failed; running that command still reports the failure.

@josephfarina
