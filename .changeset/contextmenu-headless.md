---
'@astryxdesign/core': patch
---

[feat] `createContextMenu(element, {items | render, label?, isDisabled?, onOpenChange?, presentation?})` attaches ContextMenu's menu to an element already on the page, without React, and returns `{open(at?), close(), destroy()}`. It opens on the element's context request (a held finger or pen, a right click, Shift+F10 or the context-menu key), and the element's markup is untouched, so a list row keeps its list valid. `render(container)` fills the menu with custom content in plain DOM. `useContextMenu(ref, options)` is its React wrapper and takes `menuContent` JSX, as ContextMenu does.

@vjeux
