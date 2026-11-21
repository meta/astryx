---
'@astryxdesign/core': patch
---

[feat] `@astryxdesign/core/palette`: `themePalette()` also returns the colors a look grows beyond its seeds, as the theme editor does: category colors (Badge, Token and Card tints, `--color-{background,text,icon,border}-<hue>`), chart colors (`--color-data-*`), code colors (`--color-syntax-*`) and the scrim (`--color-overlay`), and the status roles the input leaves unset, each derived from the seeds and kept readable on Core's surfaces. A seed's own tokens are unchanged.

@josephfarina
