---
'@astryxdesign/core': patch
---

[fix] `Lightbox`: a viewer that unmounts while it is open (rendered only while open, or removed with its view) now returns focus to the element that opened it, when that element is still on the page, instead of dropping it to the page. A control the user pressed to remove the viewer keeps its focus.

@cixzhang @duytbp
