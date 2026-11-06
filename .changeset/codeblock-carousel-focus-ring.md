---
'@astryxdesign/core': patch
---

[fix] `CodeBlock` and `Carousel`: the code viewport (while the code overflows) and the carousel scroller draw the theme's focus ring instead of the browser's default, and a theme's `--focus-outline-*` tokens reach them. Both rings sit inside their component's clipped box, so they show whole. The Carousel ring is painted by the carousel itself rather than the scroller, so the scroller's edge-fade mask no longer fades it, at rest or mid-scroll. The Carousel ring is drawn by an internal shared overlay.

@cixzhang
