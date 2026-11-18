---
'@astryxdesign/cli': patch
---

[fix] When Node already uses a compile cache (`NODE_COMPILE_CACHE`), the CLI leaves it as it is and no longer makes an empty `node-compile-cache-<uid>` folder in the temp folder.

@josephfarina
