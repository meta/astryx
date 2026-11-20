---
'@astryxdesign/cli': patch
---

[feat] An integration that wires its themes with its own provider component can name it once in its manifest: `themeProvider: {export, from}`. `astryx doctor` then counts the package's theme as wired when the app renders that component (the theme whose stylesheet the app imports, or the package's only theme), instead of warning that no theme is wired, and its CLI-managed-themes check names the theme and its provider instead of offering `theme add`. An import of the provider that is never rendered still does not count. A stylesheet the app imports from the package counts as the theme it is, wherever the package keeps it; doctor names it, and never calls it missing when it cannot match it to one theme. `astryx theme list` shows `wiredBy` beside each of the package's themes, in text and JSON; its added and default marks stay as they are. A CLI that does not know the key, or a key inside it, ignores it with a warning and keeps the rest of the manifest.

@josephfarina
