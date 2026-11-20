---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`: a page whose root theme draws in one mode stays readable in a viewer of the other scheme. Before, the file declared both color schemes, so a dark viewer showed its dark canvas behind a light-only theme's dark text. The export reads the theme module's `colorModes` export when it has one, without running the module. Otherwise it reads the page or text colors the theme's compiled stylesheet, which the page imports (directly or through an `@import` in its own CSS), sets on its root: a light page with dark text draws in light only, and a dark page with light text in dark only. Any color the theme editor reads counts (hex, a named color, `rgb()`, `hsl()`, `oklch()` and the other CSS color forms). A theme that sets neither (a fonts-only or accent-only theme), sets a `light-dark()` color (a value for each mode), sets one the export cannot fix (such as a `var()`), or sets any page or text color under a light or dark condition keeps both modes, as before. A one-mode page declares only that scheme and paints the theme's own page color on the document. For a theme passed to `Theme` unbuilt, whose CSS is injected only at run time, only what the page's own stylesheets set on that theme's root counts. A page whose theme draws in both modes, or that has no theme, is written as before.

@josephfarina
