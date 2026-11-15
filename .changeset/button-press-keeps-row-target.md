---
'@astryxdesign/core': patch
---

[fix] A finger's press no longer changes the containing block of a Button's own pseudo-elements. With `position: static` and `transform: none` through `xstyle`, a Button's `::after` can cover a row as its tap target. That target now holds through the press and its release, so a tap on the row activates the Button again. The release still runs on the compositor and paints nothing.

@vjeux
