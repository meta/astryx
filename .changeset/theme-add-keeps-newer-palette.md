---
'@astryxdesign/cli': patch
---

[fix] `astryx theme add` of a shared theme whose palette a newer CLI made (a palette recipe this CLI keeps but does not make) now carries the theme's working files with that palette exactly as saved, instead of leaving them out, so the receiving app can keep editing the theme: changes to what the palette is made from need a CLI that makes the recipe, and every other change saves. The editor's first build there keeps the palette shades the app copy shows. The palette module is carried only when it is exactly what the palette generator writes for the colors it holds, so no code comes with it. The JSON names the recipe as `data.copy.workingFiles.keptPalette`, and the add says the palette is kept as made.

@josephfarina
