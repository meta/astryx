---
'@astryxdesign/core': patch
---

[fix] Malformed component icon slot values no longer throw while formatting diagnostics. Invalid fields keep the component fallback without dropping valid sibling fields, and production skips diagnostic formatting.
@korkt-kim
