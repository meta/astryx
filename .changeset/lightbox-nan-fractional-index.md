---
'@astryxdesign/core': patch
---

[fix] An open Lightbox shows the nearest item when `index` or `defaultIndex` is not a whole number. A fraction rounds to the nearest item, and NaN shows the first item. Before, the viewer rendered nothing for those values.

@cixzhang
