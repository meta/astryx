---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a part setting saved for one mode no longer locks a theme switched to one mode (it stays saved, is named as not applying, and applies again with both modes); a part's length (padding, a corner radius, a gap) that reads a design token of another kind (a color, a font, a duration) is refused like the token form, naming a length token that works; and a `var()` whose name is not a CSS variable (`var(color-x)`, `var(-x)`, `var()`) is refused for every value, with the repaired form.

@josephfarina
