---
'@astryxdesign/charts': minor
'@astryxdesign/core': patch
---

[feat] Add Sparkline, a chromeless trend graphic for tables and tiles, composed from the charts marks, tooltip, and series colors. `Chart` gains an `xLabel` prop naming the x dimension in the accessible name and hidden data table (defaults to the x key), and the `area()`/`line()` builders share one `strokeWidth` rule (a finite option clamps at zero, anything else falls back to 2).
