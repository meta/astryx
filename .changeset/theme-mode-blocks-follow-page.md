---
'@astryxdesign/core': patch
---

[fix] A theme's `@dark` and `@light` component styles under a `system` `Theme` now follow the scheme the page draws in, as the theme's colors do. On a page that draws in one scheme, such as a page that names no scheme (no `reset.css`, no `color-scheme` on the page root and no `<meta name="color-scheme">`), which draws light, the styles of that scheme apply whatever the reader's device is set to: a reader whose device is set to dark no longer gets the theme's dark component styles on the light page, and gets its light ones. On a page that follows the reader, the styles follow the reader's setting as before. At the first paint of a server-rendered page, before the root `Theme` mounts, they follow the reader's setting.

@josephfarina
