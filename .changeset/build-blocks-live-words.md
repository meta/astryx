---
'@astryxdesign/cli': patch
---

[fix] `astryx build` ranks blocks by every word a block's docs use, also words its fitted word weights do not know (such as a newer block's or an integration's own terms), so a request that uses those words is tied to that block. Its ranking coefficients are refit for this overlap.

@josephfarina
