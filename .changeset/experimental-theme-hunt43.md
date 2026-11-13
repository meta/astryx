---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a font family list missing a comma (`"Open Sans" serif`) is refused with the comma put back (`"Open Sans", serif`), read with css-tree; a suggestion never folds the list into one family holding an escaped quote. A font pasted with its property name (`font-family: Georgia, serif;`, or a `font:` shorthand) is read as the family list it names, for the `font` dial and exact font tokens. A `var()` with a fallback is never refused as reading nothing; when its name is a slip from a design token, a note says the fallback always shows.

@josephfarina
