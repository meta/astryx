---
'@astryxdesign/cli': patch
---

[perf] `integrationComponentConflicts()`, `integrationDocConflicts()` and `integrationCheck()` from `@astryxdesign/cli/api`, and `doctor integration components`, `doctor integration docs` and `integration check`, find Core's components from the folder listings they already read, with far fewer file system calls. Their results are unchanged.

@vjeux
