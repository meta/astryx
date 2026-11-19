---
'@astryxdesign/core': patch
---

[fix] A Table column without `renderCell` no longer throws when a cell holds an Invalid Date. The default cell renderer now shows an Invalid Date as an empty cell, as it does for null and undefined. Sorting already treats it as a missing value.

@josephfarina
