---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `[light, dark]` pair on a token that is not a color (a shadow too) is refused however your theme file writes it (a constant, `as const`, `satisfies`, a spread from an imported module), by `set`, `show` and `undo` and by `experimental theme compile` and `--check`. A state rule your theme file sets on a part (`:hover`) is named like a variant: in `set`, `show` (with no contrast caveat for a setting that does not show) and `undo`. `compile` of a theme whose saved settings hold a value the editor refuses names the `undo` that removes it, and the phone note says to set fonts on the theme's typography, or in a rule for the same screens, to keep them on phones.

@josephfarina
