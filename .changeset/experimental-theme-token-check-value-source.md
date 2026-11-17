---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the check of a theme's own token values judges the input its source gives `defineTheme()`, evaluated as a build evaluates the module, so a value the build would drop or Core would refuse is named before anything is written. `null` and booleans are refused as no text; a value under a computed key is judged before the build drops it; a typography weight given as a number names its field and the quoted form; and the tokens a part's blocks in `components`, `onDark`, `onLight` and adaptation rules set are judged like page-wide tokens, each named by its scope and line.

@josephfarina
