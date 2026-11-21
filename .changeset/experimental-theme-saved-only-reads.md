---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `--only` now means one thing to `set` and to the settings reader. A saved `only` on a part that is styled on its own (as another editor version saved it) no longer stops the theme from opening. It is read and built as without it, which is what it means there, and one note says so; the next change saves it so. `set --only` reads it by the same rule. That includes a bar's height or vertical padding (the app's header): it spreads through no group, so a saved `only` there is read as without it too.

@josephfarina
