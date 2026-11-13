---
'@astryxdesign/cli': patch
---

[fix] `theme build` (with or without `--check`), `integration verify` and `doctor` load a theme that extends a base theme whose module imports its own stylesheet, such as a package's `./themes/<slug>` entry that loads the theme's CSS. Node stopped on that import with `Unknown file extension ".css"`. Now a stylesheet that any module of the theme imports loads as an empty module. Node resolves each stylesheet import from the module that writes it, so a missing stylesheet still fails. This needs Node 22.15 or later; on Node 22.13 and 22.14, a stylesheet that a module in another folder imports still fails as before.

@josephfarina
