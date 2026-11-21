---
'@astryxdesign/cli': patch
---

[fix] A help run that an unknown command names keeps the program options you typed: `astryx frobnicate --json` names `astryx help --json`, and `astryx eject --json` names `astryx theme eject --help --json`, so a reader of JSON output gets the help as JSON. Words written after `--` are words, so a help run carries none of them as options.

@josephfarina
