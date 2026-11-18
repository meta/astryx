---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a light-only or dark-only theme's build exports its one mode beside the theme (`export const colorModes = ["light"];`), and its app copy re-exports it, so `theme add` wires the theme in that mode. Older CLIs and Core ignore the extra export.

@josephfarina
