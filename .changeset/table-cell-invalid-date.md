---
'@astryxdesign/core': patch
---

[fix] A Table column without `renderCell`, the tree column of a tree table included, no longer throws or prints engine text when a cell holds an Invalid Date. The default cell renderer now shows an Invalid Date as an empty cell, as it does for null and undefined. Sorting already treats it as a missing value.

@josephfarina
