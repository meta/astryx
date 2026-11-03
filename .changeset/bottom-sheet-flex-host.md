---
'@astryxdesign/core': patch
---

[fix] BottomSheet: the open sheet's dialog places its panel with a flex row instead of a grid. In desktop WebKit, measured in Playwright, an update inside an open sheet lays out faster; the iOS simulator showed no difference. A percentage `height` (for example `'50%'`) now takes that share of the screen at the bottom edge; before, a short sheet was cut short and a long one hung from the top of the screen.

@vjeux
