---
'@astryxdesign/core': patch
---

[fix] A disabled `ResizeHandle` keeps its tab stop. Before, it left the tab order, so keyboard users could not reach it to hear that it is disabled. Now it stays in the tab order, as a disabled control keeps its tab stop, and it still ignores pointer and keyboard input and says so with `aria-disabled`.

@vjeux
