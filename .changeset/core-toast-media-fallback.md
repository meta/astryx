---
'@astryxdesign/core': patch
---

[fix] Toast: before the surface is measured (a server render, a static page), the Toast's text side comes from the theme's own resolved inverted surface color, by the same rule the measurement uses, instead of assuming the surface is dark in light mode. This applies to a surface written as a hex color, `rgb()`/`rgba()` or a named color; a surface in any other syntax (such as `oklch()` or `hsl()`) still starts from the color mode until the measurement runs. A theme whose inverted surface is a light hex or `rgb()` color in light mode no longer renders a Toast with white text on a white bar until the page runs its script.

@josephfarina
