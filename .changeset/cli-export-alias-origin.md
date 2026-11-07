---
'@astryxdesign/cli': patch
---

[chore] Internal: the export reader follows `export const X = Y` to where `Y` is declared, so an alias of an imported value has that value's origin.

@cixzhang
