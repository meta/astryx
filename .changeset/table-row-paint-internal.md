---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[chore] Internal: Table's row plugins hand a row's state to Table, which alone writes the row fill. A selected row paints the same wash as before, and the theme editor still finds it.

@cixzhang
