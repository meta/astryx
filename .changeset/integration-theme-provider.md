---
'@astryxdesign/cli': patch
---

[feat] An integration that wires its themes with its own provider component can name it once in its manifest: `themeProvider: {export, from}`. `astryx doctor` then counts the package's theme as wired when the app renders that component (the theme whose stylesheet the app imports, or the package's only theme), instead of warning that no theme is wired, and its CLI-managed-themes check names the theme and its provider instead of offering `theme add`. An import of the provider that is never rendered still does not count. `astryx theme list` shows `wiredBy` beside each of the package's themes, in text and JSON. A CLI that does not know the key ignores it with a warning and keeps the rest of the manifest.

@josephfarina
