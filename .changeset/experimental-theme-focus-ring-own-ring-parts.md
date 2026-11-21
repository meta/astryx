---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` no longer gives a filled part that draws its own focus ring (a button) a ring color picked for its fill, since that ring lies on what is around it, and gives every part inside a filled part that paints its own fill (a banner, a white top bar) a ring color that reads on that fill.

@josephfarina
