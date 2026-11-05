---
'@astryxdesign/core': patch
---

[chore] Internal: each spring role, and the navigation, paging and picker motion tables, register themselves when their module loads, so a spring role plays at the theme's `tempo` wherever it plays, with no register call. A page that plays no spring ships no springs registry. A module that imports single spring rows carries only those rows, unless it also reads the whole `springs` table or calls `registerSpringsTable()`. Not exported from the package entry point.

@vjeux
