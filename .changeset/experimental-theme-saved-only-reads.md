---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `--only` now means one thing to `set` and to the settings reader. A saved `only` on a part that is styled on its own (as another editor version saved it) no longer stops the theme from opening. It is read and built as without it, which is what it means there, and one note says so; the next change saves it so. Where that puts it at the same place as a later entry of the same setting, the later one, the one the build shows, is kept, and the earlier one is named and left out. `set --only` reads it by the same rule.

@josephfarina
