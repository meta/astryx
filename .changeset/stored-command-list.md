---
'@astryxdesign/cli': patch
---

[perf] `astryx --help`, `-h` and `help` print the root help from a command list stored in the package when it is published, instead of loading every command first. The list holds the terms and descriptions the fully loaded CLI prints, so while every command loads the help reads the same. A command whose module fails to load is listed in the published root help under its normal description, instead of being marked as failed; running that command still reports the failure.

@josephfarina
