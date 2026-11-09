---
'@astryxdesign/core': patch
---

[fix] BottomSheet keeps its snap points and its reactivated entrance in state, and syncs its drag's stop resolver at commit. A render React discards, as a suspended transition does, no longer changes the stop a released drag rests at.

@vjeux
