---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor`'s font check no longer asks you to confirm a font service stylesheet (such as a Google Fonts `@import`) that names its families. A family the stylesheet does not name is a warning that names it, and the fix names the package that loads it when one does (`@fontsource/jetbrains-mono`).

[fix] `astryx theme build`: a `.js` theme source named after its theme (`brand.js` for theme `brand`) is offered a free folder for its outputs (`--out design/brand-2/brand.css`), not the same command again; in a theme source whose default export is the theme, a base imported as a package's default export, or as the whole package, is told the named import that works (`import {neutralTheme} from '@astryxdesign/theme-neutral'`). `astryx theme add` of a theme it does not find says where a theme you wrote must live to be added by name, and that a theme you built elsewhere needs only its imports.

@josephfarina
