---
'@astryxdesign/cli': patch
---

[fix] `astryx theme use` and a later `astryx theme add` say when no source file of the app imports the generated theme module, so the default theme they record is not what the app shows yet, and print the one-time wiring (`change.notImported` in `--json`). `astryx doctor` and these commands read that from one shared check.

@josephfarina
