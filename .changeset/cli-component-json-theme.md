---
'@astryxdesign/cli': patch
---

[feat] `astryx --json component` and `component()` from `@astryxdesign/cli/api` now return `data.theme` on a detail result, each batch row's detail, and a list result: the configured theme's name and the custom values it adds, by component and prop, the same values the text output marks with `*` (each as `prop:value*`, so a component with two extensible props says which prop takes which value). `data.theme` is `null` without a theme, and its `values` stay empty until the theme's built module exports `themeVariants`. A recorded theme that fails to load now exits 1 with `ERR_THEME_LOAD` in JSON too, as it already did in text, and a theme that cannot be found prints no warning in JSON.

@jiunshinn
