---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a hover background or a focus outline the theme sets for one variant now stays under a resting `background` shorthand or `outline` for that variant and a size. Before, the resting rule outweighed it by order, so small ghost buttons lost the theme's hover or focus ring.

@josephfarina
