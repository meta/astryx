---
'@astryxdesign/cli': patch
---

[fix] `astryx search` prints the first sentence of each result's description instead of the whole description, so a list of 20 results stays short. Each result's command still prints its full doc, and `--verbose` and `--json` keep descriptions whole.

@josephfarina
