---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add` with a shared theme keeps the theme editor's saved state when the bundle carries it: the folder holding `<name>.settings.json` is copied to `themes/<name>/`, where `theme editor` opens it, so the receiver keeps editing the theme's description instead of only its built files. A folder there that the add did not write is left as it is and named; `theme remove` takes back the files it copied. The JSON gains `data.copy.editor`.

@josephfarina
