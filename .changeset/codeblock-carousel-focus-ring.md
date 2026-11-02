---
'@astryxdesign/core': patch
---

[fix] `CodeBlock` and `Carousel`: the code viewport (a tab stop once the code overflows) and the carousel scroller draw the theme's focus ring instead of the browser's default, so a theme's `--focus-outline-*` tokens reach them. Both rings sit inside their box, so the component's own clip no longer cuts them off.

@cixzhang
