---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental icon` breaks a tie between equally scored icons in favor of one whose name the query names in full, so a request for a plus icon to add a row gets `plus` before `folder-plus`. Remaining ties keep id order.

@josephfarina
