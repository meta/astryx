---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor` text used to print each check as a block of `id:`, `status:`, `label:`, `message:` and `fix:` lines, with the summary counts on four lines. It now prints each check as one record: its status (`[ok]`, `[warn]`, `[fail]`, `[info]`) in a column, then its id, label, message and `fix`. A legend under the heading names each field by its `--json` key, and the summary prints its counts on one line. Every field still prints, so the answer reads the same in less space: about 10% less on a small app checked with `--built`. The JSON output does not change.
@josephfarina
