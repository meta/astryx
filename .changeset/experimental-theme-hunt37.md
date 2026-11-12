---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a token set on one part (`--on`) that reads a whole-theme token is checked for a loop only within the scope it is set in. The part reads its own settings first and the whole theme's after, and a whole-theme value never reads a part's, so `--color-accent var(--color-text-primary)` with `--color-text-primary var(--color-accent) --on top-nav-heading` is accepted in either order, and the saved settings no longer leave `show` and every `set` refusing; a loop within one part or within the whole theme is still refused. An exact accent (or other fill color) given as `var()` of another token, a two-color `light-dark()` or a color function of tokens is read as the color it shows in each mode, so the text on it is picked to read on that color and the notes name it (`var(--color-warning) = #ffce2f`); a value that still cannot be read as one color is named as unchecked instead of the generated shade.

@josephfarina
