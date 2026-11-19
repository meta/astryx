---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add` with a shared theme keeps the theme editor's saved state when the bundle carries it: the folder holding `<name>.settings.json` is copied to `themes/<name>/`, where `theme editor` opens it, so the receiver keeps editing the theme's description, and the editor's builds update the app copy, instead of only its built files. The state is read as data and checked before it is copied; settings the editor refuses, a palette recipe this CLI does not know, two folders of state, or a folder there that the add did not write are named, and the theme is still added. `theme remove` takes back the copied files that are unchanged. The JSON gains `data.copy.editor`.

@josephfarina
