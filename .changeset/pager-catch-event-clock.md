---
'@astryxdesign/core': patch
---

[fix] Carousel paging: on a busy page, a finger held on a settling row now stops it, as on an idle page. Before, when the page received the touch and its lift together, a short hold read as a tap and the row ran on to its target.

@vjeux
