---
'@astryxdesign/cli': patch
---

[fix] A command `theme build` (or `experimental theme compile`) suggests after refusing a source (a Windows-style path, a folder, a file that is not a theme module, or a build output) keeps the `--check`, `--out` and `--icons-specifier` it was given, so following it still checks instead of writing outputs.

@josephfarina
