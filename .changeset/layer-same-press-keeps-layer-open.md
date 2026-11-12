---
'@astryxdesign/core': patch
---

[fix] A light-dismiss layer opened while a press is released no longer closes at that release. A DropdownMenu or ContextMenu row that opens a Popover when chosen with a mouse now leaves it open, as it already did with a finger; the next press outside, or Escape, closes it as before.

@cixzhang
