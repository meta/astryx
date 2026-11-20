---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental icon new-set --from` run again on a set whose library dropped an icon now removes that icon in every look from the generated module and its declarations. Before, the filled (or other variant) export stayed behind and named a library export that no longer exists, so importing the integration package failed.

@josephfarina
