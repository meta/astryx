---
'@astryxdesign/cli': patch
---

[perf] `doctor` reads its audit of the CLI's own authoring docs from a copy stored in the package when it is published, instead of parsing the CLI's authoring sources on every run. The copy is used only while every file the audit read is unchanged, so `doctor` reports the same thing.

@josephfarina
