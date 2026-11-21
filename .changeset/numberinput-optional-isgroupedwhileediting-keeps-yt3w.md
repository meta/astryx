---
'@astryxdesign/core': patch
---

[feat] NumberInput: optional `isGroupedWhileEditing` keeps locale digit grouping while the field has focus. Default remains ungrouped while focused. Each edit regroups the integer digits and keeps the caret before the same digits. Backspace or Delete next to a separator deletes the digit beyond it. A draft that holds a group character the person typed or pasted stays as typed instead, and Backspace or Delete there removes just the character. Composition is left alone until it ends.
@mvanhorn
