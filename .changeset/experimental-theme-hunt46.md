---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a font file or link (`./fonts/My.woff2`, `Inter.woff2`, a font service URL, `url(…)`) and a name holding a colon are refused as font family names, for the `font` dial and exact font tokens, with how to load a file (`@font-face` or a font package) and never a suggestion that quotes them. A value pasted with its property name (`color: #e11d48;`, `font-weight: 700`, `font-size: 18px`) is offered as the value given, a `var()` with a fallback as its fallback, and `light-dark()` on a color dial as its light color with a note; `font-family: ;` with no value is refused as no value. A size suggestion is the token's own default instead of `6px`, and a token typed with its colon (`--color-accent:`) is offered without it first.

@josephfarina
