---
'@astryxdesign/cli': patch
---

[perf] `astryx --help`, `-h` and `help` print the root help from a command list stored in the package when it is published, instead of loading every command first. The list holds the terms and descriptions the fully loaded CLI prints, so the help reads the same.

@josephfarina
