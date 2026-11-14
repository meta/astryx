---
'@astryxdesign/cli': patch
---

[fix] `theme build` (with or without `--check` or `--family`), `integration verify` and `doctor` load a theme that extends a base theme whose module imports its own stylesheet, such as a package's `./themes/<slug>` entry that loads the theme's CSS. Node stopped on that import with `Unknown file extension ".css"`. On Node 22.15 and later, a stylesheet that any module of the theme imports now loads as an empty module. Node resolves each stylesheet import from the module that writes it, so a missing stylesheet still fails. On Node 22.13 and 22.14 nothing changes: a theme build (`theme build`, `integration verify`, `doctor`'s freshness check) still stops on any stylesheet import, and a read of a built theme module (`doctor`, `component`) still loads only a stylesheet whose import resolves from that module's folder.

@josephfarina
