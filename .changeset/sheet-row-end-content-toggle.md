---
'@astryxdesign/core': patch
---

[fix] DropdownMenu, ContextMenu: in a bottom sheet, a checkbox in a row's `endContent` now toggles when it is tapped or clicked, and a switch when it is clicked. A tapped switch now toggles at the release instead of about 300 ms later. The sheet leaves a press that starts on a control in a row's content to that control.

@bstcoc
