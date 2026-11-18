---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`:

- An app's own pasted CSS variables (`--brand-primary`, `--brand-bg`…) are read by the role their name ends in. "<color> text on a <color> page" sets the text and the page separately.
- "luxury fashion brand: black and ivory" no longer reads black as the accent. On a dark-only theme, the page color takes no mode.
- Glass words ("frosted glass", "glass cards") set `surfaces glass`. "tight dense spacing" gives tight spacing. "gridlines" are table cell borders. "big buttons" makes the buttons bigger.
- "bottom border 1px #49454f" sets only the bottom side. "1px border rgba(…)" keeps the width. "dialogs with a 1px border" gives the dialog an edge of its own.
- "bigger, 17px" uses 17px, while "like 1 or 2 px" stays an example. "badges uppercase bold" runs both changes in turn.
- When a typed fill would leave a part's text below 4.5:1, a line beside it gives the text a color that reads in that mode.

@josephfarina
