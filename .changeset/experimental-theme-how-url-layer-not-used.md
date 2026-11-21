---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` names a second `url()` layer it does not write in its "not used" line, as typed (`cards background-image: url(a.png), url(b.png)`). When the part is said after the value (`background-image: url(a.png), url(b.png) on cards`), the second layer is still left out unnamed.

@josephfarina
