---
'@astryxdesign/core': patch
---

[perf] A pointer `ContextMenu` (the default presentation, and every Table cell menu) no longer carries the touch sheet's action list: `ContextMenu` now shares `DropdownMenu`'s sheet module, which loads the sheet only for the sheet presentation. A page with a Table that has cell actions, or with a `ContextMenu`, loads about 57 KB less JavaScript before first paint (about 20 KB gzip). A menu with `presentation="bottom-sheet"`, or `adaptive` on a compact touch screen, still loads its sheet after mount and opens it as before.

@cixzhang
