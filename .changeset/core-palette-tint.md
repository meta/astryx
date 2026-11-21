---
'@astryxdesign/core': patch
---

[feat] `@astryxdesign/core/palette`: the palette mapping moves the accent tint (`--color-accent-muted`) to the nearest stop, still a tint, under which an exactly set `--color-text-accent` reads at 4.5:1. `themePalette()` sets no exact text, so its output is unchanged by this.

@josephfarina
