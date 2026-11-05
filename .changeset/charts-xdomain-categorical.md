---
'@astryxdesign/charts': patch
---

[fix] `Chart` ignores `xDomain` when x is categorical, as documented. Before, a categorical chart given `xDomain` got a linear scale over its string categories, so bars drew nothing and line, area and dot marks had no x position.

@thecodebasedot
