---
'@astryxdesign/cli': patch
---

[experimental] The icon commands' names say "meaning", as their text does: `astryx experimental icon new-definition` is now `astryx experimental icon new-meaning`; `icon add --definition` and `--new-definition` are now `--meaning` and `--new-meaning`; `astryx experimental icon --definitions` is now `--meanings`; and the docs page `cli/experimental/icon-definitions` is now `cli/experimental/icon-meanings` (each meaning's page moves with it). `icon map` names its first argument `<meaning>`. The old names have no alias: an old option is an unknown option, the old subcommand name is read as search words, and the old docs route is not found. All of these are experimental. JSON keys and shape do not change; command, flag and route names inside JSON strings (suggested commands, `command`, `newDefinition`, error messages, the command manifest) use the new names. The `iconNewDefinition()`, `iconAdd()` and `icon()` API options, config keys and file names do not change.

@josephfarina
