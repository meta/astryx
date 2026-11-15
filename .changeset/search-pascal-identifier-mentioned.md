---
'@astryxdesign/cli': patch
---

[fix] `astryx search` reads a one-identifier query written as a component's, type's or icon's name (PascalCase, such as `ThemeProvider`) as its words also when all it matches is text that mentions it, including a code term or table cell a doc's keywords gather. The entry that mentions it comes before every entry its words only match, after an entry one of its words names outright. A prop's name (camelCase, such as `autoFocus`) keeps only the entries that mention it, as before, and other queries rank exactly as before.

@josephfarina
