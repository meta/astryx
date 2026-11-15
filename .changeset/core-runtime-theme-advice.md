---
'@astryxdesign/core': patch
---

[fix] `Theme`'s runtime style injection hint no longer names a package or an import made up from the theme's name (`@astryxdesign/theme-canvas-editor/built`, `canvas-editorTheme`). It gives the build step any runtime theme can take, `astryx theme build` on the file that defines it, and says to import the built .js and .css it writes; a theme from an Astryx theme package ships both built.

@josephfarina
