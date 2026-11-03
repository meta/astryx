---
'@astryxdesign/core': patch
---

[fix] `Dialog` (and `AlertDialog`, `CommandPalette`): a dialog that unmounts while it is open, for example one rendered only while open (`{isEditing && <Dialog isOpen …>}`) or removed with the rest of a view, now returns focus to the control that opened it instead of dropping it to the page.

@cixzhang @duytbp
