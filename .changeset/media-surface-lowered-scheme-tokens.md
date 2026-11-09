---
'@astryxdesign/core': patch
---

[fix] Media surfaces keep their colors when a bundler lowers `light-dark()`. A bundler that targets older browsers (for example Vite with lightningcss) resolved the theme's scheme-dependent tokens on the theme root, so inside a `MediaTheme` surface accent text, secondary text, borders and backgrounds kept the page's color scheme: in a light page, Neutral's accent text on a dark surface was #1b1b1b. Each media surface now re-declares those tokens so they resolve under its own scheme. CSS that keeps `light-dark()` renders as before.

@cixzhang
