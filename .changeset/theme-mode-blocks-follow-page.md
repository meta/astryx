---
'@astryxdesign/core': patch
---

[fix] A theme's `@dark` and `@light` component styles under a `system` `Theme` now follow the scheme the page draws in, as the theme's colors do. On a page that names no scheme (no `reset.css`, no `color-scheme` on the page root and no `<meta name="color-scheme">`), which draws light, a reader whose device is set to dark no longer gets the theme's dark component styles on the light page. The root `Theme` writes the scheme it draws in to `<html>` as `data-astryx-scheme`. Until it mounts, at the first paint of a server-rendered page, those styles follow the device's setting as before.

@josephfarina
