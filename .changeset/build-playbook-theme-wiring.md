---
'@astryxdesign/cli': patch
---

[fix] `astryx build` with no query now names the exact theme wiring `theme add` prints for your project: the imports and the value `<Theme>` takes (`themes[defaultThemeSlug]` from the generated `astryx-themes` module), or the provider to pass it to when an installed package declares one. When no theme is added yet, a last step gives the `theme add <slug>` command for your installed theme or the starter theme. The old rule left the value open (`theme={...}`), so pages often passed a theme name such as `"light"` and crashed once script ran.

@josephfarina
