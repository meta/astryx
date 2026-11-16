---
'@astryxdesign/theme-gothic': patch
---

[fix] Links on coloured cards take the card's own category ink. A part inside a coloured card that paints a fill of its own (a nested card, a field, inline code, a menu) draws the theme's own text again, and a transparent card keeps the card's ink, so card text and links meet WCAG AA (4.5:1).

@josephfarina
