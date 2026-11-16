---
'@astryxdesign/cli': patch
---

[experimental] `astryx template` with an icon set chosen (`experimental.iconSet`) and no `experimental.iconVariant`: a template written with the library the main set wraps now imports each icon from the set, so the copy depends only on the set and no longer asks to install the library. Each icon moves to the set's export that re-exports the same library export (reported as `by: 'wrapped'`), so it draws the same artwork. An icon the set does not re-export maps through the set's `map`; one the set has in neither way keeps its import. With or without `experimental.iconVariant`, a library export under another name now counts as the export the set re-exports when both resolve to the same declaration, so with a variant such an icon draws the set's icon in that look instead of keeping its import.

@josephfarina
