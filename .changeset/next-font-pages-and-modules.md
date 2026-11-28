---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` and `astryx theme build` name the next/font fix (the theme's font family set to the font's CSS variable) in a Pages Router app that loads next/font in `pages/_app`, and when the root layout imports its fonts from a module of the app's own, such as `./fonts` or `@/app/fonts` through the app's tsconfig paths. `theme build --detail full` and `theme build --family` print that fix once instead of once per family.

@cixzhang
