---
'@astryxdesign/core': patch
---

[fix] `Tooltip`: an open tooltip that has moved clear of its trigger now also stays clear when the trigger moves on screen without resizing, in layout or because the page scrolled, at most one painted frame later. Moving it keeps every animation in its content where it was.

@ejhammond
