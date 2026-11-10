---
'@astryxdesign/core': patch
---

[fix] Icons registered with `registerIcons()` now reach swizzled `Icon`, `CodeBlock`, `Table` and `Timestamp` copies on the same React. Themes registered by name are now shared by every Core bundle loaded on one React. Each registry is one per React, so a second React on the page never renders the first one's elements. No API changes.

@cixzhang
