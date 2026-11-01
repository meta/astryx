---
'@astryxdesign/core': patch
---

[fix] BottomSheet: in WebKit, including iOS Safari (26.2 simulator), a sheet at a set height whose content sits directly in it keeps its bottom padding at the end of its scroll (0 → 16 px), instead of ending flush with the last line.

@vjeux
