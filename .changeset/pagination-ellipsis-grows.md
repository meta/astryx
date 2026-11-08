---
'@astryxdesign/core': patch
---

[fix] `Pagination`'s ellipsis grows with a larger text size, as its page buttons now do through `Button`. Its size is now a minimum height, so the "…" stays inside its own box. At the default text size nothing changes.

@cixzhang
