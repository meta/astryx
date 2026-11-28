---
'@astryxdesign/core': patch
---

[fix] A mouse or pen press on a control inside a ClickableCard, SelectableCard, Item row, TreeList row or Token that does not run the container now paints only that control, as a finger's press already did where the primary pointer is coarse. The container keeps its hover look and shows no pressed state. A press on the container's own surface still paints the container. An Item row whose root is a link, and an Item row with a role its parent supplies, still paint for a press on their nested control, because a press there belongs to the row. In an Item row, a press on a read-only input, or on a control under a link or button ancestor, now paints no row press for a mouse, a pen, or a finger where the primary pointer is coarse, as its click runs no row.

@cixzhang
