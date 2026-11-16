---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[fix] Each built-in theme ships its open-licensed fonts. `fonts.css` loads every face from a woff2 file in the package (licenses in `fonts/`), with `font-display: fallback` (the face loads from the package before the text's first paint, so there is no fallback flash), instead of a Google Fonts `@import` that held the page until the request answered (chocolate's Fraunces as its variable face, keeping its optical size), so an app or screenshot offline (a sandbox, CI) draws at once and shows the theme's real fonts.

@josephfarina
