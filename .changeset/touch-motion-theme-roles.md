---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] Themes can retune touch motion roles. `defineTheme({motion})` takes `springs`, `durations` and `curves` keyed by motion role, the table path of a measured touch motion value (`springs.sheetPresent`, `navigation.transitionMs`), at the root or in an adaptation rule, and writes one `--motion-*` variable per role it sets. A role the theme leaves out keeps its measured default, an unknown role id is refused, and the duration scale (`fast`, `medium`, `ratio`) is optional when a theme sets only roles. `astryx docs motion` lists every motion role with its CSS variable and default, and the theme authoring guide and template describe the new fields.

@vjeux
