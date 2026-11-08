---
'@astryxdesign/cli': patch
'@astryxdesign/build': patch
---

[fix] `astryx swizzle` writes an `astryx-swizzle.json` marker into an output folder it owns (one the copy creates, an empty one, or one it marked before), naming each package the folder's copies came from and its version. `@astryxdesign/build`'s Babel, PostCSS and Vite integrations, and `withAstryx()` under webpack, compile the copies under that folder below `astryx-theme`, so a theme's component overrides reach a swizzled component as they reach the package component. For a folder that already holds other files it writes no marker and says what it found and how to add the marker by hand; the `swizzle.copy` receipt reports this in a new optional `marker` field. Under Turbopack and with the stock StyleX plugins, a copy's styles still land above the theme. The marker is not listed among the copy's files.

@cixzhang
