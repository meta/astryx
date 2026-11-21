---
'@astryxdesign/cli': patch
---

[feat] `astryx theme add` with a shared theme keeps the experimental theme editor's saved state when the bundle carries it: its data files (`<name>.settings.json` and the palette data) are copied to `themes/<name>/`, where the experimental theme editor opens it, so the receiver keeps editing the theme's description, and the editor's builds update the app copy, instead of only its built files. theme add reads them as data, runs and copies no shared code (the editor builds the theme's source when it opens it), and checks them before it copies them; settings the editor refuses, a palette recipe no Astryx CLI makes, two folders of state, or a folder there that the add did not write are named, and the theme is still added. The app copy keeps the shared theme's display name and description. `theme remove` takes back the copied files that are unchanged. The JSON gains `data.copy.workingFiles`.

@josephfarina
