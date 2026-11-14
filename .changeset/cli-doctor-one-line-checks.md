---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor` text prints each check on one line: its status (`[ok]`, `[warn]`, `[fail]`, `[info]`) in a column, then its id, label, message and `fix`. A key line under the heading names each field by its `--json` key, and the summary prints on one line. Every field still prints, so the answer reads the same in less space: about 10% less on a small app checked with `--built`. The JSON output does not change.
