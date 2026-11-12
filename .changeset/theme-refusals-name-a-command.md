---
'@astryxdesign/cli': patch
---

[fix] Every refusal of the theme commands names a command that works. `theme use` and `theme remove` of a theme that is not added suggest `theme add <slug>` only when that theme exists, and `theme list` otherwise; removing the default names `theme use` with another added theme. Unknown slugs in `theme add` and `theme eject` suggest whole commands for the closest themes, `theme targets` with no match suggests the full list, and refused paths, flag combinations and loads suggest the command that runs. A theme that imports a package the app lacks names the install command in `theme build` and in `doctor`, without absolute paths. `theme build --check` text lists the checked outputs, as the JSON does.

@josephfarina
