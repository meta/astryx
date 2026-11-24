---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu: in a bottom sheet, a checkbox in a row's `endContent` now toggles when it is tapped or clicked, and a switch when it is clicked. A tapped switch now toggles at the release instead of about 300 ms later.

[fix] Switch: a click that toggles the input while a finger presses it, as a menu sheet's row does on the release, is the press's one toggle. The switch no longer clicks its input again after the finger lifts.

@bstcoc
