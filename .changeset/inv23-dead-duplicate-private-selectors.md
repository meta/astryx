---
'@astryxdesign/core': patch
---

[chore] Internal: ChatLayout drops a scrollbar style rule whose condition nothing ever set, and Popover, Table and the press feedback controller each read an internal marker through one shared name instead of a second hand-typed copy. No visible or behavioral change.

@cixzhang
