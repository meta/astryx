---
'@astryxdesign/core': patch
---

[fix] BottomSheet keeps its snap points and its reactivated entrance in state, and syncs its drag's stop resolver at commit. A render React discards that changes `snapPoints`, as a suspended transition can, no longer changes the stop a released drag rests at.

@vjeux
