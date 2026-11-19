---
'@astryxdesign/core': patch
---

[fix] A BottomSheet no longer drags under a finger that presses content whose `touch-action` allows no one-finger pan, such as a menu whose rows fit, so a press-slide-release list inside a sheet keeps its own gesture. Content that allows a pan on either axis, including the date pickers' month scroller, still pulls the sheet as before.

@cixzhang
