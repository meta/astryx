---
'@astryxdesign/cli': patch
---

[docs] `astryx theme remove --help` states its exit codes plainly: removing the only added theme exits 0, removes the generated module and prints the lines the app root must drop; removing the default fails only while other themes are still added, and the line says to choose another default with `theme use` first. Agents read the old line, "is the default while other themes are added", as "the default can never be removed" and added a theme nobody asked for.

@josephfarina
