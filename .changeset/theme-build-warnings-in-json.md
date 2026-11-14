---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build --json` carries in its `warnings` the `--out` warnings the text run prints (a stylesheet name that is not .css, an output of another theme source it replaces, a folder the theme editor made), names a folder it cannot write with its fix instead of a temporary file's error, and names an `extends` written as a helper's call or a conditional as what it cannot follow instead of an inline icon registry.

@josephfarina
