---
'@astryxdesign/cli': patch
---

[feat] `astryx template --list` prints the first sentence of each template's description, so the catalog is about a quarter shorter. `--json` keeps descriptions whole, and `astryx template <id> --skeleton` prints a template's whole description above its layout. The first-sentence rule that `astryx build` shares no longer ends a sentence at a period inside quotes, so a description quoting a date such as "2. Nov. 2026" reads whole there too.

@josephfarina
