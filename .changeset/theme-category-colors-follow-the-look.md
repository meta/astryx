---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme's category colors (Badge, Token and Card tints) and chart colors now follow its look. Whenever the look changes (accent, neutral, vibrancy), the editor grows them from Core's hues at the accent's strength and the palette's vibrancy. Card tints stay pale enough for the theme's text, secondary text and links; badge text reads at 4.5:1, icons and chart series at 3:1; and the hues stay apart. A look that would draw two hues alike, or cannot keep them readable, keeps the base theme's and says why. An exact --color-<role>-<hue> or --color-data-* setting wins. A change's result counts these in one line each.

@josephfarina
