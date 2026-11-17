---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` contrast checks measure a part with a fill of its own on Core's media surface (a button on an overlay's dark island) with the text color that surface gives it, so a glossy light button whose label turns white there is listed as a problem, with a fix that sets the button's own color (its variant), which reaches it on the surface and reads on its fill everywhere. A label on its part's own fill is measured on the fill its variant draws.

@josephfarina
