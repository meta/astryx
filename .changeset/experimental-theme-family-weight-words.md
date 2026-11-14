---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a weight word at the end of a font family's name is part of the name (`Arial Black`, `Archivo Black`, `Segoe UI Semibold` are taken as typed) unless the whole name is no family the editor knows and the name without the word is (`Inter ExtraBold` is Inter and a weight); a weight number (`Inter 600`) is never part of a name. The Segoe UI weights Windows ships as families of their own are on the system font list.

@josephfarina
