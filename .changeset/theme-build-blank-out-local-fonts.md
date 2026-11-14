---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` refuses a blank or whitespace-only `--out` (it wrote files named by the spaces alone), and its note on fonts named but not loaded leaves out the families a local theme's own font stylesheet loads (`<slug>.fonts.css` beside the source, the stylesheet `theme add` imports). `astryx theme build` and `astryx doctor` also treat Segoe UI Light, Semilight, Semibold and Black as system fonts, the faces Windows installs as families of their own, so neither reports them as not loaded.

@josephfarina
