---
'@astryxdesign/core': patch
---

[fix] A BottomSheet no longer drags under a finger that presses content whose `touch-action` forbids the vertical pan, such as a menu whose rows fit, so a press-slide-release list inside a sheet keeps its own gesture. Content that allows the vertical pan still pulls the sheet as before.

@cixzhang
