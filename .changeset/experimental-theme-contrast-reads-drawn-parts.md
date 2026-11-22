---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: the contrast check measures a part on the fill and color the build draws there. A part's own `--only` fill keeps it under a later group fill, so the check reads the part's own fill, reports no problem the built theme does not have, and suggests no color that makes the drawn pair worse.

@josephfarina
