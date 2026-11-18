---
'@astryxdesign/core': patch
---

[feat] A trackpad's two-finger swipe moves an `Item` or `ListItem` swipe-action row with the fingers from its first event past 8 px and, when they lift, settles it on the nearest stop at their speed, without stopping first. Within one swipe an open row only closes, and a long fast swipe fires the outermost action where a full swipe may. A mouse wheel's notches never swipe a row.

@vjeux
