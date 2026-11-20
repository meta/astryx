---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: building a theme the theme editor made now also says that the build does not write (or, with `--check`, does not check) the theme's app copy in `src/themes/<theme>/`, which the app imports, and names the `astryx experimental theme compile` command that builds the theme and writes the copy.

@josephfarina
