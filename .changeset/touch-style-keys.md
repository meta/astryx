---
'@astryxdesign/core': patch
---

[chore] Internal: core's touch style keys stay literal, and a test pins every one to the touch presentation resolver's constants (`touchKeys`, internal to core). An imported `defineConsts` key compiles to a different StyleX priority than the same literal. No public export and no style changes.

@vjeux
