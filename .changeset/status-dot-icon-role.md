---
'@astryxdesign/core': patch
---

[fix] `StatusDot`'s `success`, `warning` and `error` dots paint their status icon role (`--color-icon-<status>`) instead of the strong status fill, so the dot keeps 3:1 or more against the page and card surfaces; the warning dot used to read near 1.8:1 on a muted card. Success and error dots change colour too: they take their status icon colour, which is darker in light mode in the default theme. An `icon` inside a status dot now paints in the surface colour.

@cixzhang
