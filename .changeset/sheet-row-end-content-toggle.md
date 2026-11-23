---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu: in a bottom sheet, a checkbox or switch in a row's `endContent` now toggles when it is tapped or clicked. Before, the press ran no row and the control did not change.

[fix] Switch: a click that toggles the input while a finger presses it, as a menu sheet's row does on the release, is the press's one toggle. The finger's lift no longer toggles it back.

@bstcoc
