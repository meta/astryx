---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` points the focus ring of what a filled part holds (a colored top bar, a filled popover) at a color that reads on that fill, so keyboard focus inside it still shows. The ring a filled part draws around itself (a button, a popover, a clickable card, a token, a selector) takes the color around it, since it lies there, and each part inside that paints its own fill (a card, a banner, a white top bar) gets a ring that reads on its own fill. A checkbox's box, which rings where its native input has focus, is left alone.

@josephfarina
