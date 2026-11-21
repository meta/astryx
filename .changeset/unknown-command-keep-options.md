---
'@astryxdesign/cli': patch
---

[fix] A help run that an unknown command names keeps the program options you typed: `astryx frobnicate --json` names `astryx help --json`, and `astryx eject --json` names `astryx theme eject --help --json`, so a reader of JSON output gets the help as JSON. A word after `--` is a word, not an option.

@josephfarina
