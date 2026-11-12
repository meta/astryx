---
'@astryxdesign/core': patch
---

[chore] Table's internal runtime context now says whether the Table windows inside its parent's height, instead of carrying the first window's seed height. Its shared protocol moves to version 2, so a Table copied by swizzle from an earlier version keeps a runtime context of its own.

@humbertovirtudes
