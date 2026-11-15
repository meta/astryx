---
'@astryxdesign/core': patch
---

[fix] `Theme`'s runtime style injection hint no longer names a package or an import made up from the theme's name (`@astryxdesign/theme-canvas-editor/built`, `canvas-editorTheme`). It gives the build step, `astryx theme build` on the file that defines the theme with `--detail full`, whose printed import lines bring in the built .js and .css; a theme from an Astryx theme package ships both built.

@josephfarina
