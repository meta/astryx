---
'@astryxdesign/core': patch
---

[fix] Inside a nested `Theme`, Core's default colors now come from that Theme's own theme and color mode. Before, a color the inner theme does not set came from the page's theme instead. Under the gothic theme, for example, a Tooltip inside a nested light neutral `Theme` showed white text on a near-white surface. Where an app's CSS build lowers `light-dark()`, the defaults inside a nested dark `Theme` also kept the page's light values, so a Tooltip's text, or the focus ring of a theme that sets no accent, could match its surface. Each `Theme` that applies a theme now declares again the Core color defaults that differ by color mode. A color token an app sets on the page root no longer reaches inside such a `Theme` for those tokens; set it in the theme instead.
