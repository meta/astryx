---
'@astryxdesign/core': patch
---

[fix] A `Dialog` with `purpose="info"`, a `Drawer`'s scrim, and `CommandPalette` now close on a backdrop press only when the press both starts and ends on the backdrop. Selecting text in a field and releasing past the edge no longer closes it and loses the input. A press on the backdrop alone still closes it, with a mouse, a pen, or a finger.

@cixzhang @duytbp
