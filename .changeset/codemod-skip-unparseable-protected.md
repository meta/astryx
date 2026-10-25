---
'@astryxdesign/cli': patch
---

[fix] `astryx upgrade` no longer fails when a protected file (vendored, generated, or ignored) does not parse, such as a vendored bundle written for another toolchain. It skips the file, lists it under `declinedCandidates` with the parse error's location, and completes the rest of the upgrade. A file upgrade owns that does not parse still fails the run, and protected files that parse are still checked and reported.

@ejhammond
