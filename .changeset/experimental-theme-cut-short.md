---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the sample card's buttons wrap to a second row when a theme's buttons are wider than the card (butter's and matcha's padding, a bolder weight, roomier spacing or a larger text size), so the preview never cuts their labels short. With `--png`, text the sample page's pictures still draw cut short (a label that ends in an ellipsis or runs past the edge of a box that clips it, such as badges at a large text size) is measured in the page by the browser that takes the picture and named in `set`'s and `show`'s results, as a note and as a problem. The problem's fix line is `flex-shrink 0` on the part, offered only when the browser measured it drawing every label whole; otherwise it says that line does not. A theme whose pictures cut nothing short says nothing.

@josephfarina
