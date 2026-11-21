---
'@astryxdesign/cli': patch
---

[fix] A help run that an unknown command names keeps the program options you typed: `astryx frobnicate --json` names `astryx help --json`, `astryx eject --json` names `astryx theme eject --help --json`, and a typo beside an option the CLI does not take (`astryx compnent --bogus --json`) names `astryx help --json` where it named `astryx --help`, so a reader of JSON output gets the help as JSON. Words written after `--` are words, so a help run carries none of them as options.

@josephfarina
