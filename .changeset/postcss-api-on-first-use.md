---
'@astryxdesign/cli': patch
---

[perf] `astryx doctor` starts about 6 to 10 ms sooner, and a first lookup in a project whose integration imports the CLI's API about 15 ms sooner. Doctor's theme checks and the codemods' parser loaded postcss as they loaded, so every importer of the CLI's API loaded it too; they now load it only when they read a stylesheet. Output does not change.

@josephfarina
