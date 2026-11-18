---
'@astryxdesign/cli': patch
---

[fix] `astryx template <name> ../<path>` that leaves the project is refused with the same commands as an absolute path outside it: the place inside the project, the same path run from its nearest folder, and the print. Before, a `..` path got the refusal with no command to run.

@josephfarina
