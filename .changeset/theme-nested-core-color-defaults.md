---
'@astryxdesign/core': patch
---

[fix] A Tooltip inside a nested light `Theme` under the gothic theme no longer shows white text on a near-white surface. In shipped builds, a `Theme` nested inside a page of another theme now uses its own theme's inverted surfaces instead of the page theme's: a Core color default that the inner theme does not set now comes from Core, in that `Theme`'s color mode. Where an app's CSS build lowers `light-dark()`, the defaults inside a nested `Theme` also follow its own color mode now, so a Tooltip's text, or the focus ring of a theme that sets no accent, no longer matches its surface in a dark pane. Each `Theme` that applies a theme declares again the Core color defaults that differ by color mode, so one of those tokens set on the page root no longer reaches inside such a `Theme`; set it in the theme instead.
