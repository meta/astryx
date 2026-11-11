---
'@astryxdesign/core': patch
---

[chore] Theme tokens: token resolution reads the status-role defaults from their own small module, which the theme-rule generator also imports, so `theme/tokens` and `useTheme` no longer import the generator module. Every resolved token value and every generated rule stays the same. Production builds with esbuild, webpack and Turbopack already removed the unused generator code, so their first load does not change; a bundler that keeps whole modules no longer includes the generator for token resolution. An app that renders `Theme` still loads the generator, because `Theme` writes runtime CSS.

@cixzhang
