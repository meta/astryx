---
'@astryxdesign/core': patch
---

[fix] `ResizeHandle`'s grab zone stays centred on the divider whatever `pillPlacement` says, which now moves only the pill. An inline zone takes at most half of a pane shorter than it, and an overlay Handle takes at most half of the pane it sits in. A short item, such as a 30-minute calendar event resized from its edge, keeps its own drag, and a drag on the pill still resizes wherever the pill is drawn. (#9529)

@vjeux
