---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the theme docs and the editor's help now lead with the whole-theme dials (accent, neutral, corners, surfaces, spacing, type, font, text-size) as the way to start. A setting on one part (`--on`, a CSS property or a token on that part) is described afterwards, as the way to drill in when no dial makes the change. That section also says a part setting wins over the dials there, so that part stops following them. The theme doc's "One kind of part" section is now "Drill into one part".

@josephfarina
