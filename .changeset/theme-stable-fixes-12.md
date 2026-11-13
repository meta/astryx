---
'@astryxdesign/cli': patch
---

[fix] A command `theme build` (or `experimental theme compile`) suggests after refusing a source (a Windows-style path, a folder, a file that is not a theme module, or a build output) keeps the `--check`, `--out` and `--icons-specifier` it was given, so following it still checks instead of writing outputs. This holds for a family check, a theme file that is a link, a plain-object family member and a file that changed while loading, and the suggested command is quoted for the shell it runs in (PowerShell too).

@josephfarina
