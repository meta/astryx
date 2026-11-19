---
'@astryxdesign/core': patch
---

[fix] A Table stays the one scroll region when a page host gives every table's parent `overflow-x: auto`. Before, the box inside the Table scrolled instead, so the Table lost its keyboard stop and focus ring.

@josephfarina
