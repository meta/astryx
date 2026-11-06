---
'@astryxdesign/build': patch
---

[fix] A swizzled copy now compiles as Astryx source in the Babel, PostCSS, and Vite integrations. Every module under a folder that holds `astryx-swizzle.json`, the file `astryx swizzle` writes into its output folder, gets the library class prefix and lands in `@layer astryx-base`, below `astryx-theme`. Before, the copy's rules landed in the product layer above the theme, so a theme's component overrides did not reach it. Turbopack builds do not read the marker yet. No API changes.

@cixzhang
