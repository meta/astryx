---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` no longer warns about theme fonts for the official themes. The `theme-fonts` check now reads the families that a Google Fonts `@import` URL names (both the `css2` and the older `css` endpoint) as loaded, so `theme-neutral` and the other first-party themes pass as shipped. An import from any other font service still gets the warning.

@prath47
