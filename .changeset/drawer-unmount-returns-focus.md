---
'@astryxdesign/core': patch
---

[fix] `Drawer`: a non-modal drawer (`hasScrim={false}`) that unmounts while it is open, for example one rendered only while open (`{isEditing && <Drawer isOpen …>}`) or removed with the rest of a view, now returns focus to the control that opened it instead of dropping it to the page. A modal drawer already did.

@cixzhang @duytbp
