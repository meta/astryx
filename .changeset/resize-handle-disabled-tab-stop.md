---
'@astryxdesign/core': patch
---

[fix] A disabled `ResizeHandle` keeps its tab stop, so keyboard users can reach it and hear that it is disabled. It still ignores pointer and keyboard input and says so with `aria-disabled`.

@vjeux
