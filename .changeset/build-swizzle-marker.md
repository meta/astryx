---
'@astryxdesign/build': patch
---

[fix] A swizzled copy can now compile as Astryx source in the Babel, PostCSS, and Vite integrations. Every module under a folder that holds an `astryx-swizzle.json` marker gets the library class prefix and lands in `@layer astryx-base`, below `astryx-theme`, so a theme's component overrides reach it. `astryx swizzle` does not write the marker yet: add the file to the swizzle output folder. Under webpack, `withAstryx()` rebuilds a cached copy when its marker appears or disappears. Turbopack builds do not read the marker yet. No API changes.

@cixzhang
