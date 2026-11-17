---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a font macOS or Windows ships (such as Avenir Next, Optima, Futura, Candara, Corbel, Bahnschrift or Segoe UI Variable) gets no install line, and a Fontsource package the editor cannot vouch for gets its own install line in compile's font help, so one that does not exist never stops the others installing. Typography `fallbacks` with no `family` in that role are refused, as Core builds nothing from them. A weight the theme uses that the base theme's font stylesheet does not load is named, with the weight it shows as, by `show` and `compile`.

@josephfarina
