---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` measures a button color that also paints the toast's close button on the toast's own fill, and says plainly that no setting keeps the toast's buttons apart, with the nearest button color that reads on every toast fill and on the page when one does. Text on a pane the theme painted (a side nav's fill) is measured on that pane, and the same text shown on another pane that holds it unpainted (the mobile nav drawer) is fixed by painting that pane like the other, not by recoloring the text everywhere. Text drawn on a fill its part draws only in a state (a selected item) is fixed with a line for that state, which `set` accepts and which ends the problem. An inverted surface whose theme counterpart looks the same as the base's (the same side, nearly the same lightness) is no longer listed under missed. A radius setting on a part whose radius your own theme source sets now says the source wins there, as a padding setting does. Where the base theme's own border is a hairline, a theme's border token is a problem only when it draws nothing on the page at all.

@josephfarina
