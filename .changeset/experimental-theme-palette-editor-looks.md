---
'@astryxdesign/cli': patch
---

[experimental] The theme editor's palette looks (`astryx experimental theme editor`) change in two ways; `themePalette()` and `defineTheme({palette})` in Core are unchanged.

- A coloured card's secondary text: before, the editor lifted it like the official Neutral theme's selected rows; now it stays the card's own ink. To keep the old look, set `--color-text-secondary` on that card variant (`set <theme> --color-text-secondary <color> --on card --when variant:<color>`).
- A tinted neutral: before, it tinted only primary text and icons; now it also tints the text on inverted surfaces (`--color-on-dark`, `--color-on-light`: a toast, a card over the scrim). To keep the old look, set those two tokens back to the base theme's values.

@josephfarina
