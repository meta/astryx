---
'@astryxdesign/core': patch
---

[fix] A theme that styles `link` keeps Core's hover tint on a link's color: the rules that hold each link `color` prop's color now hold, on hover, Core's tint of that color, so a link setting of any kind (a color for one mode, or any theme link color) no longer removes the hover tint in that mode. A theme's own hover color for a link color key still wins over the tint.

@josephfarina
