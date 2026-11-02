---
'@astryxdesign/core': patch
---

[fix] `ResizeHandle`'s grab zone stays centred on the divider whatever `pillPlacement` says, which now moves only the pill, and on a pane shorter than the zone it takes at most half the pane. A short item, such as a 30-minute calendar event resized from its edge, keeps its own drag.

@vjeux
