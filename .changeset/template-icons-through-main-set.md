---
'@astryxdesign/cli': patch
---

[experimental] `astryx template` with an icon set chosen (`experimental.iconSet`): a template written with the library the main set wraps now imports each icon from the set, so the copy depends only on the set and no longer asks to install the library. Each icon moves to the set's export that re-exports the same library export (reported as `by: 'wrapped'`), so it draws the same artwork; a library export under another name counts when both resolve to the same declaration. An icon the set does not re-export maps through the set's `map`; one the set has in neither way keeps its import.

@josephfarina
