---
'@astryxdesign/core': patch
---

[feat] NumberInput: optional `isGroupedWhileEditing` keeps locale digit grouping while the field has focus. Default remains ungrouped while focused. Each edit regroups the integer digits and keeps the caret before the same digits. Backspace or Delete next to a separator deletes the digit beyond it. Composition is left alone until it ends.
@mvanhorn
