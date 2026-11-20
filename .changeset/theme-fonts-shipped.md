---
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[fix] Each built-in theme ships its open-licensed fonts. `fonts.css` loads every face from a woff2 file in the package (licenses in `fonts/`), with `font-display: fallback` (served from the same machine or a fast connection, a face arrives before the text first draws, so there is no fallback flash; a face that takes more than about 3 s leaves that page in the fallback font), instead of a Google Fonts `@import` that held the page until the request answered (chocolate's Fraunces as its variable face, keeping its optical size), so an app or screenshot offline (a sandbox, CI) draws at once and shows the theme's real fonts.

@josephfarina
