---
'@astryxdesign/core': patch
---

[fix] With an `animatedLayout` handle, content before a Collapsible or TreeList change glides too where the layout moves it: an item before the change in a centered, end-aligned or space-between row, a sibling `order` places after it, and the card around a change in a centered column. Inside a positioned, stuck sticky or top-layer ancestor of the change, only the content after the change moves: that ancestor, the wrappers inside it and the content before the change take their final place at once.

@cixzhang
