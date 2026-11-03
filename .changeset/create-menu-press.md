---
'@astryxdesign/core': patch
---

[feat] `createMenuPress(menu, options)` runs the menu press model on any element without React: the row under a release acts, the highlight follows a held pointer, a mouse press on `trigger` opens the menu, and a finger held on it opens it after the long-press delay. It keeps the options it is created with, and `destroy()` removes every listener it added. `useMenuPress(menuRef, options)` is its React form: `triggerRef` names the trigger, and there is nothing to spread. Its press exists only while the menu element is mounted, the trigger's included, so a menu rendered only while open opens on its trigger's click alone; press-to-open there keeps the options form. The options form, `useMenuPress({menuRef, …})` with its `menuProps` and `triggerProps`, works as before.

@vjeux
