---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: a `.js` theme source named after its theme (`brand.js` for theme `brand`) is offered a free folder for its outputs (`--out design/brand-2/brand.css`), not the same command again; a base imported as a package's default export, or as the whole package, is told the named import that works (`import {neutralTheme} from '@astryxdesign/theme-neutral'`). `astryx theme add` of a theme it does not find says where a theme you wrote must live to be added by name, and that a theme you built elsewhere needs only its imports.

@josephfarina
