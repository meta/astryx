---
'@astryxdesign/core': patch
---

[fix] Theme: a wrapper that applies a theme now declares the keyboard focus ring color again, as that theme's accent. In an app whose CSS build lowers `light-dark()` (browser targets older than Chrome 123, Firefox 120 or Safari 17.5), the ring inside a nested Theme of the other color mode kept the outer Theme's accent and could match its surface. It now takes the nested Theme's own accent. Builds that keep `light-dark()` show the same ring colors as before, and a theme that sets `--focus-outline-color` still sets the ring. An app's page-root `--focus-outline-color` no longer reaches inside a Theme that applies a theme; set it in the theme or on the Theme's scope instead. The theme's color tokens already work this way.

@cixzhang
