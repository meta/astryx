---
'@astryxdesign/cli': patch
---

[feat] `theme add` and `theme use` wire a theme with one color mode in that mode. When a theme's built module exports `colorModes` (`["light"]` or `["dark"]`; `theme build` writes it when the theme source exports it), the `theme.app` receipt gives that theme a `mode` field and the generated theme module lists it in a `themeModes` export. The first import's wiring passes `mode={themeModes[defaultThemeSlug] ?? 'system'}` to `Theme`, so the selected theme shows its own mode and a theme with both modes follows the system. When a later `theme add` or `theme use` first adds `themeModes` to an app that is already wired, the receipt marks `change.wireModes` and prints the wiring line to use. Once the module has exported `themeModes`, it keeps the export (empty when no theme has one mode), so the wiring keeps compiling after `theme remove`. The mode is read from the file that declares the theme, so a theme module that re-exports the built module (whole or by name) carries it. A project whose themes all have both modes gets the same receipt, module and wiring as before.

@josephfarina
