---
'@astryxdesign/core': patch
---

[fix] Tab: a label that wraps, through `xstyle`, stays centered in its tab, selected or not. An unselected label could take one line fewer than its selected (semibold) width, and it sat at the top of the tab, so selecting the tab moved it down half a line. A label on one line in a button tab looks the same as before.

@cixzhang
