---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade --list` prints each codemod on one line, its name and title, under its version, with `(optional)` on the codemods that run only on request and the package named once when every codemod shares it, instead of a five-line record per codemod. The list now grows by one line per new codemod, plus a heading when a codemod starts a new version. `--json` is unchanged.

@josephfarina
