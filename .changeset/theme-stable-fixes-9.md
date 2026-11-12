---
'@astryxdesign/cli': patch
---

[fix] The dashboard page template typechecks in an app with `noUncheckedIndexedAccess` (it renders the same), so `experimental theme preview add --template dashboard` no longer adds a type error to a strict app. `themeBuild()` no longer takes internal hand-off options for `theme build --watch` or the private-var exit code; `--watch` still warns once per session about a theme editor folder.

@josephfarina
