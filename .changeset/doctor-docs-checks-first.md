---
'@astryxdesign/cli': patch
---

[perf] `astryx doctor` reads its kept docs checks back after an edit to the app's source. They run before the scans that read the app's source (its theme wiring and, in a project that names an icon set, its placeholder icons), so what they keep no longer depends on the app's files. Right after an edit, `doctor` in a project with an app finished about 230 ms sooner. Output does not change.

@josephfarina
