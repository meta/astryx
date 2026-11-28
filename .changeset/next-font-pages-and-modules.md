---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` and `astryx theme build` name the next/font fix (the theme's font family set to the font's CSS variable) in a Pages Router app that loads next/font in `pages/_app`, and when the root layout imports its fonts, by a relative path (such as `./fonts`) or a tsconfig or jsconfig `paths` alias (such as `@/app/fonts`), from a module that itself imports or re-exports next/font. `theme build --detail full` and `theme build --family` print that fix once instead of once per family.

@cixzhang
