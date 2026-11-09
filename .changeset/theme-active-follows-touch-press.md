---
'@astryxdesign/core': patch
---

[fix] Theming: a theme's `:active` override now follows the touch press model. With a mouse it still paints on `:active`. Under a finger it paints only while Astryx believes the press, so a themed control no longer flashes the theme's press color on the touch itself or while the page scrolls.

@cixzhang
