---
'@astryxdesign/core': patch
---

[fix] Under snap paging (`hasSnap={useSnapPaging()}`), Carousel's edge buttons and `handleRef`'s `scrollNext`, `scrollPrev` and `scrollTo` move the row through the paging, also from rest. A touch that catches such a move now leaves the row on a page, as a flick's settle does. On iOS a still touch used to stop the browser's smooth scroll between two items.

@vjeux
