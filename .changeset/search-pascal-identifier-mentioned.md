---
'@astryxdesign/cli': patch
---

[fix] `astryx search` reads a one-identifier query written as a component's name (PascalCase, such as `ThemeProvider`) as its words also when all it matches is text that mentions it, so the entries its words name join the doc that mentions it. A prop's name (camelCase, such as `autoFocus`) keeps only the entries that mention it, as before.

@josephfarina
