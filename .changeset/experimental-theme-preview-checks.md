---
'@astryxdesign/cli': patch
---

[experimental] `experimental theme preview add` checks the theme before it writes any page, and skips a StyleX template page in an app with no StyleX compiler (the result says why). `experimental theme preview app` checks the folder before it builds a `--theme`, so a refusal writes nothing.

@josephfarina
