---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: the base theme's fonts stylesheet is imported only while the theme's build still names a family it loads, so a theme on `font system` or its own fonts fetches nothing it does not use. `preview add` names every page it writes again, the Colors page included, when the preview switches theme.

@josephfarina
