---
'@astryxdesign/core': patch
---

[fix] A mouse or pen press on a control inside a ClickableCard, SelectableCard, Item row, TreeList row or Token now paints only that control, as a finger's press already did. The container keeps its hover look and shows no pressed state. A press on the container's own surface still paints the container, and an Item row whose root is a link still paints, because a press there runs the row.

@cixzhang
