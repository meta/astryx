---
'@astryxdesign/core': patch
---

[fix] A stacked `BottomSheet` whose close waits in a suspended transition takes over the dim when the sheet beneath it closes, so the page behind it stays dimmed.
@vjeux
