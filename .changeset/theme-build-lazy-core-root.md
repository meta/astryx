---
'@astryxdesign/cli': patch
---

[perf] `astryx doctor`'s theme checks, family builds and builds against an older Core load an installed Core's root entry only when a `.cjs` dependency of the theme requires it. A theme beside an installed Core no longer loads all of Core and its components for them.

@vjeux
