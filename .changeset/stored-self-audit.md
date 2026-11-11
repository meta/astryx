---
'@astryxdesign/cli': patch
---

[perf] `doctor` reads its audit of the CLI's own authoring docs from a copy stored in the package when it is published, instead of parsing the CLI's authoring sources on every run. The copy is used only while the package version and every doc, type file and folder the audit reads are unchanged, so an installed CLI's `doctor` reports the same thing.

@josephfarina
