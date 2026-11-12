---
'@astryxdesign/core': patch
---

[fix] BottomSheet syncs its focus return target at commit, and no longer copies its stack view during render. A sheet removed after a render React discards, as a suspended transition does, returns focus to its committed `finalFocusRef`.

@vjeux
