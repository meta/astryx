---
'@astryxdesign/core': patch
---

[fix] Toast: before the surface is measured (a server render, a static page), the Toast's text side comes from the theme's own resolved inverted surface color, by the same rule the measurement uses, instead of assuming the surface is dark in light mode. A theme whose inverted surface is light in light mode no longer renders a Toast with white text on a white bar until the page runs its script.

@josephfarina
