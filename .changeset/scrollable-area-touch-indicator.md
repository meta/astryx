---
'@astryxdesign/core': patch
---

[feat] On touch screens, `ScrollableArea` keeps the platform's own scroll indicator. Its neutral `scrollbar-color` replaced iOS Safari's indicator with a faint bar that was hard to see while scrolling and also showed in the gap a pull opens; iOS now draws its own indicator, only while scrolling. Mouse and trackpad scrollbars keep the neutral colour. To keep the neutral colour on touch screens too, set `scrollbarColor` through the `xstyle` prop.

@vjeux
