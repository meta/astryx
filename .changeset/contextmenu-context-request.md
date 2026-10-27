---
'@astryxdesign/core': patch
---

[chore] ContextMenu opens through its trigger's context request, the path `createContextMenu` uses: a right click, Shift+F10 or the context-menu key, or a finger's or a pen's hold, once per gesture. Its hold follows the request's rules, so it yields to a gesture that has already claimed the finger.

@vjeux
