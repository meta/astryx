---
'@astryxdesign/cli': patch
---

[fix] `astryx search` reads a one-identifier query written as a component's, type's or icon's name (PascalCase, such as `ThemeProvider`) as its words also when all it matches is text that mentions it, including a code term or table cell a doc's keywords gather. The entry that mentions it stays in the answer, beside the entries its words find. In the lexical ranking, the entry that mentions it, and an entry one of its words names outright, come before every entry its words only match; search's learned order inside a score band still applies, so `astryx search` can list a words-only match above them. A prop's name (camelCase, such as `autoFocus`) keeps only the entries that mention it, as before, and other queries rank exactly as before.

@josephfarina
