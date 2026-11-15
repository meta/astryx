---
'@astryxdesign/cli': patch
---

[perf] A command that reuses kept data hands each kept list of what it read to the run's records once, instead of once for every step that reuses it, and works out the CLI-file states a derived value keys on only when one is asked for. In a project with a large integration, `component`, `docs`, `doctor`, `search`, `template` and `theme list` finish 4 to 14 ms sooner. Output does not change.

@josephfarina
