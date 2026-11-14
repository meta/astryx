---
'@astryxdesign/core': patch
---

[fix] Toast: before the surface is measured (a server render, a static page), the Toast's text side comes from the theme's own resolved inverted surface color, by the same rule the measurement uses, instead of assuming the surface is dark in light mode. This applies when the inverted surface is an opaque hex, `rgb()`/`rgba()`, `black` or `white` value and the on-dark and on-light colors are hex, `rgb()`/`rgba()`, `black` or `white` values; any other value (such as a translucent surface, `oklch()`, `hsl()` or another named color) still starts from the color mode until the measurement runs. A theme whose inverted surface is a light hex or `rgb()` color in light mode no longer renders a Toast with white text on a white bar until the page runs its script.

@josephfarina
