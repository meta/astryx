---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` still measures a fill and its on-color set inside a part when the theme sets that on-color for the whole theme or on a part elsewhere; only one set on a part around it, on a reader inside it or a part holding one (a group counts by its parts), or for a variant or state there, leaves the pair out, in the modes it is set for.

@josephfarina
