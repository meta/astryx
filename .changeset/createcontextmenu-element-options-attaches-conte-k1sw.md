---
'@astryxdesign/core': patch
---

[feat] `createContextMenu(element, options)` attaches ContextMenu's menu to any element, without wrapping it, and `useContextMenu(ref, options)` does the same from a component. A ListItem row passes its ref, so the list keeps `ul > li`, with no wrapper element, and its dividers. The menu opens on a long press, a right click, Shift+F10 or the context-menu key, and `destroy` removes every listener and node it added.

@vjeux
