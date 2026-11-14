---
'@astryxdesign/core': patch
---

[fix] An `Item` with its own `onClick` or `href` no longer rings the whole row when a control in its `startContent` or `endContent` takes focus, and a `Token`'s remove button no longer rings the whole token: each of those tab stops shows one focus ring. Rows that delegate to a nested control, and reorderable rows with a handle, keep their ring as before.

@cixzhang
