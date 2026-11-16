---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` now writes nothing for an element named in a place it cannot be kept to ("the dialog's buttons rounder") and says why, instead of changing every such part. An answer that does hold in the place, such as a color token set on the card for "the card's links", still answers. A place's own element that Core draws on its own is answered on that element. "The controls 40px tall" and "all controls taller by 4px" move every control height together for the whole theme, each size by the same amount.

@josephfarina
