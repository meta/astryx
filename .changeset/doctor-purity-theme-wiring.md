---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor --built`'s purity check no longer flags the stylesheets the app's registered themes load. It reads them from the theme module the CLI writes (`theme add` and the theme editor), so an editor-made theme starts with no "imports the stylesheet" findings. Any other stylesheet import is still flagged.

@josephfarina
