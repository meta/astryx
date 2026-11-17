---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: when a theme's own source sets a color family's fill exactly, such as `--color-accent` in `t.theme.ts`, the family's other shades (links, icons, the muted tint) now come from that color, the one on screen. Before, they came from the color setting the source overrides, so links could turn blue beside purple buttons. The note about a hard-to-read source color now names a shade of that same color.

@josephfarina
