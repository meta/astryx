---
'@astryxdesign/cli': patch
---

[experimental] `integration check` and `experimental icon new-set` follow `export const X = Y` to where `Y` is declared: an icon-set theme map or icon export written that way is now checked and recorded. `astryx swizzle` uses the same reader, so a component that imports an aliased public export imports it from the package.

@cixzhang
