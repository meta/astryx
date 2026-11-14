---
'@astryxdesign/core': patch
---

[fix] Tooltip paints the theme's inverted surface (`--color-background-inverted`), the surface Toast paints, instead of the primary text color, so a theme that sets its inverted surface styles tooltips and toasts alike. Its text stays the page surface color.

@josephfarina
