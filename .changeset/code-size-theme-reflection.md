---
'@astryxdesign/core': patch
---

[fix] Code: the `code` theme target now reflects `size` as `data-size`, so a theme can restyle code that inherits the surrounding text size (`size="inherit"`) differently from code at the default code size. When `size` is omitted, no `data-size` attribute is rendered.

@cixzhang
