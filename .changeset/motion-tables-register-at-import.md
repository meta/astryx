---
'@astryxdesign/core': patch
---

[chore] Internal: each spring role, and the navigation, paging and picker motion tables, register themselves when their module loads, so a spring role plays at the theme's `tempo` wherever it plays, with no register call. A page that plays no spring ships no springs registry, and a component still carries only the spring rows it uses. Not exported from the package entry point.

@vjeux
