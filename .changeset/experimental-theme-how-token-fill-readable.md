---
'@astryxdesign/cli': patch
---

[experimental] In `astryx experimental theme editor how`, a fill given as a theme color ("selected tab accent", `var(--color-accent)`) now gets the same readable-text step as a typed color, measured as that color is in each mode. Its text takes the theme color's own text color (`var(--color-on-accent)`) where that reads, so it follows when the theme changes the color. The answer that runs a whole ask in order carries that step right after the fill.

@josephfarina
