---
'@astryxdesign/core': patch
---

[feat] `defineTheme({palette})`: the palette now also sets the colors a look grows from its seeds, as the theme editor does: the category colors (Badge, Token and Card tints) and chart colors at the accent's strength, turned a little toward the accent's and a tinted neutral's hue; the status roles a palette leaves unset; the code colors, the code background and the overlay scrim. A color the palette cannot draw readable keeps Core's own, and so does a look color that would leave a text and fill pair Core draws below 4.5:1. A tinted neutral also tints primary text and icons and the text on inverted surfaces, and a coloured card's own secondary text stays the card's ink.

@josephfarina
