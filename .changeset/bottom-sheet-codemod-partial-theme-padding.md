---
'@astryxdesign/cli': patch
---

[docs] The `preserve-bottom-sheet-content-padding` codemod's description (shown by `astryx upgrade`) now says that a theme which sets `bottom-sheet` padding on some edges only is affected too: the added `padding={0}` zeroes every edge, including the ones the theme sets.

@cixzhang
