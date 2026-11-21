---
'@astryxdesign/core': patch
---

[perf] The breakpoint names and the compact definition now live in their own module, which imports nothing. Button, Link, IconButton, Popover, AppShell and other components that read them no longer import the theme adaptation writer. A page that renders them can leave that code out of its first load, also when the app's bundler keeps whole modules. `@astryxdesign/core/theme` exports the same names as before.

@vjeux
