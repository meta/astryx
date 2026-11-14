---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` refuses a blank or whitespace-only `--out` (it wrote files named by the spaces alone), and its note on fonts named but not loaded leaves out the families a local theme's own font stylesheet loads (`<slug>.fonts.css` beside the source, the stylesheet `theme add` imports).

@josephfarina
