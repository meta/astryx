---
'@astryxdesign/core': patch
---

[perf] The breakpoint names and the compact definition now live in their own module, which imports nothing. Button, Link, IconButton, Popover, AppShell and every other component entry except Toast no longer import the theme adaptation writer. Toast still does, because its viewport applies the caller's theme. A page that renders them can leave that code out of its first load, also when the app's bundler keeps whole modules. `@astryxdesign/core/theme` exports the same names as before.

@vjeux
