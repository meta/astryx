---
'@astryxdesign/cli': patch
---

[perf] With TypeScript 5.3 or later, `validateIntegration()`, `integrationComponentConflicts()` and `integrationCheck()` from `@astryxdesign/cli/api`, and the commands that run them, reuse each TypeScript file a check parsed for later checks in the same process that parse it the same way, while the file is unchanged, instead of parsing it again for every check. Their results are unchanged.

@vjeux
