---
'@astryxdesign/core': patch
---

[fix] A drag that begins in a BottomSheet's scrolling content stays the content's for its whole length: content scrolled to its end mid-drag rubber-bands instead of handing the rest of the drag to the sheet, and the sheet grows only from a drag that begins with the content at its end.

@vjeux
