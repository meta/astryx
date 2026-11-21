---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` no longer gives a filled part that draws a focus ring by its own rules (a button, a switch) a ring color picked for its fill, since that ring lies on what is around it, and gives every other part inside a filled part that paints its own fill (a banner, a white top bar) a ring color that reads on that fill. A frame that rings for a control inside it (a card) is read for what it holds.

@josephfarina
