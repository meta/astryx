---
'@astryxdesign/core': patch
---

[chore] Table's internal runtime context now says whether the Table windows inside its parent's height, instead of carrying the first window's seed height. Table's scroll area and `useTableInfiniteScroll` read the new flag, and the context no longer changes when only the seed changes. Its shared protocol moves to version 2, so a Table or loading plugin copied by swizzle from an earlier version keeps a runtime context of its own.

@humbertovirtudes
