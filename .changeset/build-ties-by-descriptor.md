---
'@astryxdesign/cli': patch
---

[fix] `astryx build` no longer picks between page templates that score exactly the same by alphabetical order. When templates of one family tie, the one whose own description, keywords and page components best match the idea starts, then the one most typical of its family. Templates an integration adds compete in these ties the same way as Core templates.

@josephfarina
