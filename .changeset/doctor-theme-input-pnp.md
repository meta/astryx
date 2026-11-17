---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` no longer fails its private theme variables check in a Yarn Plug'n'Play project. For a built-in theme that the app installs as a package, the check now reads that package's own theme source, which is the copy the app uses, instead of the CLI's copy, whose icon import Yarn refuses to resolve.

@josephfarina
