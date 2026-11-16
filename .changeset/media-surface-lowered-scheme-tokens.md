---
'@astryxdesign/core': patch
---

[fix] Media surfaces keep their colors when a bundler lowers `light-dark()`. A bundler that targets older browsers (for example Vite with lightningcss) resolved the theme's scheme-dependent tokens on the theme root, so inside a `MediaTheme` surface accent text, secondary text, borders and backgrounds kept the page's color scheme: in a light page, Neutral's accent text on a dark surface was #1b1b1b. Each media surface now re-declares those tokens so they resolve under its own scheme. CSS that keeps `light-dark()` renders as before, with one exception: a value set for one of those tokens on the theme root, or on an element between it and a media surface, no longer reaches the surface. So an app that maps a scheme-dependent token on the theme root for its page no longer changes a media surface's color.

@cixzhang
