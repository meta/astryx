---
'@astryxdesign/core': patch
---

[fix] Section: with `minHeight` and no `height`, the background, the dividers and the padding now fill the whole minimum height. Before, they stopped at the content's height, so a `muted` region painted only its top part and a bottom divider sat inside the region. The docs now say that an omitted `padding` takes the theme's section padding first, so the default is 4 only when the theme sets none.

@cixzhang
