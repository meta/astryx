---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a `dark-only` or `light-only` theme looks the same whatever the system asks for.

- Every two-mode value the theme builds, including the base theme's part rules (selected items, tree items, the file dropzone, number citations, segmented-control items) and its two-mode tokens, is written as the theme's one mode.
- The theme sets `color-scheme` to its mode, so anything it inherits in two modes takes that mode too.

@josephfarina
