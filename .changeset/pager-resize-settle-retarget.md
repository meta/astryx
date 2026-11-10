---
'@astryxdesign/core': patch
---

[fix] Carousel paging: a row that resizes while it settles no longer stops at once or runs back to an earlier page. The settle plays on at its speed, to the last page when it was heading there, and otherwise to the page nearest where it was heading. It ends on that page with no step when it goes back to native scrolling. A resize that leaves the row past its new last page, or that gives the row its first width, still lands it at once on the page it was heading for.

@vjeux
