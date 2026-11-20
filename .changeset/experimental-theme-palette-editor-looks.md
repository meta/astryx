---
'@astryxdesign/cli': patch
---

[experimental] In the theme editor (`astryx experimental theme editor`), a tinted neutral now tints the text on dark inverted surfaces (`--color-on-dark`: a toast, a card over the scrim); before, that text kept the base theme's white. To keep the old look, set `--color-on-dark` back to the base theme's value. `themePalette()` and `defineTheme({palette})` in Core are unchanged.

@josephfarina
