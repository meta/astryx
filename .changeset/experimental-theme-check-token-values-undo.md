---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one check for the token values a theme's own source gives, run by `show`, `set`, `undo` and `compile`, each refusing with the same message and writing nothing. A `[light, dark]` pair holds exactly two values in quotes (one, none or three is refused). Values from an imported module or written as an expression (`'ban' + 'ana'`, a template) are checked as a build evaluates them, naming the line. A second `tokens` key is refused, naming both lines (JavaScript keeps only the last). A family list in one pair of quotes is refused in the file as `set` refuses it (the browser reads it as one family by that whole name). The `typography` fields are checked: a family is one family name (the rest go in `fallbacks`), the scale's ratio is above 1 and at most 4, its base a positive size.

@josephfarina
