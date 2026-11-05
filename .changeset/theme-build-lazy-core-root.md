---
'@astryxdesign/cli': patch
---

[perf] `astryx doctor`'s theme checks, family builds and builds against an older Core defer an installed Core's root entry. It loads only when the theme or one of its `.cjs` dependencies imports it. A theme that does not import Core's root no longer loads all of Core and its components for them.

@vjeux
