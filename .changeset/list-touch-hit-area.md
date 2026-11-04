---
'@astryxdesign/core': patch
---

[feat] Under a finger (a coarse primary pointer), an interactive `List` row's hit target grows toward 44px where its neighbors leave room: the shared touch hit area measures each row and stops at half the gap to the nearest neighboring row or control. Rows look and lay out exactly as before, and a mouse is unchanged. Under a finger a list row's `::after` is that invisible layer, so decorate a row with a child instead. An `Item` that stops delegating to a nested control now drops its pressable-container marker, so a clickable card around it gets a mouse click in the row's padding again.

@vjeux
