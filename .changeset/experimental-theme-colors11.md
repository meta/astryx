---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: every refusal on fonts and part colors names a command that works.

- A dial typed in other letters (`Font`, `FONT`) is answered as the dial.
- A CSS `font` shorthand on a part (`bold 16px/1.5 Georgia, serif`) is split into the longhands to set, one command each.
- A suggestion is never MDN's note in place of a value (`dependsOnUserAgent`).
- A bad color on a part's color property suggests a color that works.

@josephfarina
