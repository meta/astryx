---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor --built` no longer flags the setup stylesheet as page styling. A stylesheet that only imports Astryx packages' CSS (`reset.css`, `astryx.css`, a theme's CSS), as the getting-started steps write it, is read as wiring. A stylesheet with rules of its own, or an import from another package, is still flagged.

@josephfarina
