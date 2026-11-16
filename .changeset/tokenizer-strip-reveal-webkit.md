---
'@astryxdesign/core': patch
---

[fix] In Safari, a `Tokenizer` inside an `InputGroup` now scrolls its token strip so a token whose remove button takes keyboard focus is fully in view and clear of the edge fades. Before, the strip often stayed put, leaving the focused token hidden outside it.

@cixzhang
