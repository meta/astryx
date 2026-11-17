---
'@astryxdesign/cli': patch
---

[experimental] Experimental `exportIconIndex()` and `rankIconIndex()` in `@astryxdesign/cli/api`, the icon counterpart of `exportSearchIndex()` and `rankSearchIndex()`. `exportIconIndex({cwd, package?})` returns the icon sets `icon()` searches in a folder as plain JSON, and `rankIconIndex(query, indexes, {set?, limit?})` ranks stored indexes with `icon()`'s own ranking, so a catalog that must not load package code can store each package's index once and answer icon searches exactly as `astryx experimental icon` does. `icon()` ranks through the same function, so its answers are unchanged. An index is ranked only by the CLI version that made it.

@josephfarina
