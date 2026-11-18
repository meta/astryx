---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` names an import through a path alias (`@/lib/c`, `~/lib/c`) as one the theme loader does not map, never as a package to install; expands a quoted glob to the theme sources it matches in its suggestion; and counts the fonts macOS and Windows ship, from one table by platform, as system fonts in its note on fonts named but not loaded.

@josephfarina
