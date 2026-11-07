---
'@astryxdesign/core': patch
---

[fix] Under snap paging (`hasSnap={useSnapPaging()}`), Carousel's edge scroll buttons and edge fades follow the row as it moves. They change in the frame where it leaves an edge. A flick used to leave them as they were until the settle ended and the row went back to native scrolling, so the start button came back about half a second after the row had visibly left the start.

@vjeux
