---
'@astryxdesign/cli': patch
---

[fix] `astryx template` and `astryx build` read a template's needs from its real imports only. Words in comments, strings and JSX text no longer count as packages, so templates such as `form-wizard`, `form-wizard-vertical` and `table-tree` no longer ask you to install `Next`, `Distribution` or `canvas-editor`. A path alias such as `~/lib` or `#internal`, or a name npm does not accept, is not reported as a package to install.

@josephfarina
