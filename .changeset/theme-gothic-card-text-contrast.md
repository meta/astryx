---
'@astryxdesign/theme-gothic': patch
---

[fix] Links on coloured cards take the card's own category ink. Inside a coloured card, a nested card, a field, inline code, an open menu, a selected segment, an input group addon, a step number, a banner and a striped table row draw the theme's own text again, and a transparent card keeps the card's ink, so card text and links meet WCAG AA (4.5:1). Secondary text on default and muted cards takes the next stop, so it reads on the accent tint of a selected row or a numbered citation there.

@josephfarina
