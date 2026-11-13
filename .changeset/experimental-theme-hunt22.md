---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: template overwrite on any disk, and undo answers that are true.

- `experimental theme template … --overwrite` never replaces a theme editor file under another spelling of its name (`themes/t/T.theme.ts` on a case-insensitive disk, or through a link).
- `undo <theme> mode` or `base` on a theme with no saved change says so, instead of claiming its history does not reach back; after every step is undone it says the value was never changed.
- `undo <theme> headings <word>` with only the other half set names the half that is set.
- A mistyped `base` suggests only a base this project has installed, and says when the name is a theme made here (which cannot be a base).
- `undo <thing> <value>` matches the saved value in either quote style and with any spacing around `/`.

@josephfarina
