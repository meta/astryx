---
'@astryxdesign/theme-butter': patch
---

[fix] Muted cards in dark mode draw the theme's own light text on their dark fill, and links on coloured cards take a deeper accent stop. A part inside a coloured card that paints a fill of its own (a nested card, a field, inline code, a menu) draws the theme's own text again, and a transparent card keeps the card's ink. Secondary text on a selected row or a numbered citation in dark mode steps to the nearest stop that meets WCAG AA (4.5:1).

@josephfarina
