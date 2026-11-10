---
'@astryxdesign/core': patch
---

[fix] Carousel paging: a finger or a pen that lands on the row during an edge button's move now stops it at the touch, as on iOS, instead of letting it run on for about 85 ms. The item under the finger still takes the tap. A mouse is unchanged.

@vjeux
