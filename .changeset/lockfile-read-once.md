---
'@astryxdesign/cli': patch
---

[perf] The CLI reads a project's lockfile only for an Astryx package the project has not installed, and reads it once per lookup for all such packages. In an app whose `node_modules` holds the Astryx packages it declares, no command parses the lockfile. With a large lockfile (2 MB in our measurement), that saves about 50 ms per command and about 200 ms per `doctor` run.

@josephfarina
