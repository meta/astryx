---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads "no rounding anywhere" (and "everywhere", "everything", "at all") as the corners dial set to square plus `--radius-full 0px`, so every part drawn with the pill radius goes square too, circles included; a radio's mark keeps its circle.

@josephfarina
