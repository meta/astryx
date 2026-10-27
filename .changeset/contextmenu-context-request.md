---
'@astryxdesign/core': patch
---

[chore] ContextMenu is built on `createContextMenu`: it attaches the headless context menu to its own trigger, so the two open, present and dismiss alike. It opens on its trigger's context request (a right click, Shift+F10 or the context-menu key, or a finger's or a pen's hold, once per gesture), and its hold yields to a gesture that has already claimed the finger. `menuContent` still reads the caller's own contexts.

@vjeux
