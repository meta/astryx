---
'@astryxdesign/core': patch
---

[fix] `Icon` given its glyph as `name` (as other icon libraries call it) renders that glyph and warns in development to use `icon`, instead of failing with "Element type is invalid". `name` does not reach the DOM.

@josephfarina
