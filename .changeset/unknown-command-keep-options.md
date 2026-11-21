---
'@astryxdesign/cli': patch
---

[fix] The `astryx help` an unknown command names keeps the program options you typed: `astryx frobnicate --json` names `astryx help --json`, so a reader of JSON output gets the help as JSON.
@josephfarina
