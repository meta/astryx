---
'@astryxdesign/cli': patch
---

[fix] `astryx build` ranks blocks also by single words a block's docs use that its fitted word weights do not know (such as a newer Core block's own terms), so a request that uses those words can tie to that block.

@josephfarina
