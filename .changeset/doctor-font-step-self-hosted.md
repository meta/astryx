---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` names a font package to install only for an open font it knows. For a self-hosted family (such as `Acme Sans`) it keeps the real step: add the font stylesheet export or a local `<slug>.fonts.css`, then rebuild the theme, instead of a guessed `@fontsource` package.

@josephfarina
