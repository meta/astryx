---
'@astryxdesign/core': patch
---

[fix] An animated element keeps its compositing layer until its animation ends on the animation's own clock. Before, when that clock ran behind the page's, as with DevTools' animation speed lowered, the layer could go while the element still moved.

@vjeux
