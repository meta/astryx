---
'@astryxdesign/cli': patch
---

[fix] `astryx build` with no query now names the exact theme wiring for your project: the imports and the value `<Theme>` takes (`themes[defaultThemeSlug]` from the generated `astryx-themes` module), plus `theme add <slug>` for an installed theme that isn't added yet, or the starter theme to install when the project has none. The old rule left the value open (`theme={...}`), so pages often passed a theme name such as `"light"` and crashed once script ran.

@josephfarina
