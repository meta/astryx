---
'@astryxdesign/core': patch
---

[feat] Under a finger (a coarse primary pointer), an interactive `List` row's hit target grows toward the touch target, 44px unless the theme sets `--size-touch-target`, where its neighbors leave room: the shared touch hit area measures each row and stops at half the gap to the nearest neighboring row or control. Rows look and lay out exactly as before, and a mouse is unchanged. Under a finger a list row's `::after` is that invisible layer, so decorate a row with a child instead.

@vjeux
