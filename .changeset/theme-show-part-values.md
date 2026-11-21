---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show <theme> --on <part>` gives what one part of a theme shows, as a lookup that writes nothing: each CSS property the part reads, at rest and in each variant, with its final value (per mode when the modes differ), the declaration that gives it, the tokens it reads, and who decides it (Core, the base theme, or the theme's own file, through a token, a dial or a rule on the part). It takes any theme the project builds: an editor theme, a local theme or an installed theme package (a slug two packages provide is the one the app records). The text lists the part at rest and the first variant values that differ; `--json` (`themeEdit.showPart`) carries every value. An editor theme is read from its saved settings: what its theme file adds by hand below them is not shown yet.

@josephfarina
