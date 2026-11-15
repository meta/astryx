---
'@astryxdesign/cli': patch
---

[fix] `astryx build` lists only page templates it could start from among keyword search's matches: a template that is not ready yet is left out of `pages` and the "Keyword search matched" line. The start's reason still names a not-ready direct match.

@josephfarina
