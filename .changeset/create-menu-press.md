---
'@astryxdesign/core': patch
---

[feat] `createMenuPress(menu, options)` runs the menu press model on any element without React: the row under a release acts, the highlight follows a held pointer, a mouse press on `trigger` opens the menu, and a finger held on it opens it after the long-press delay. `update(options)` merges new options, which apply from the next event without ending a press in progress. `startBehavior: 'items'` starts a press only on an item, so other content in the menu keeps its own clicks. `destroy()` removes every listener it added. `useMenuPress(options)` is unchanged, and Core's menus now run on the factory. One behavior changes for a finger: a finger's press-down that a page handler stops or cancels, inside or outside a Core menu, now starts no press, so on a page that cancels every press-down, touch menus lose press-drag-release; plain taps still work. A mouse or pen press behaves as before.

@vjeux
