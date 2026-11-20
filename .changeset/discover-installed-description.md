---
'@astryxdesign/cli': patch
---

[feat] `astryx discover` shows an installed integration's package.json `description`, as it already did for a package a source lists: on the list's Installed side and on the package page (`discover <package>`). Text shows its first sentence; `--json` carries the whole description as the entry's `description`. Terminal escape codes and control characters are removed, and a blank description is left out. Search (`discover <words>`), which already matches package descriptions, now also finds an installed package by a word in its description.

@josephfarina
