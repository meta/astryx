---
'@astryxdesign/richtext': patch
---

[fix] A link inside a disabled `RichTextEditor` no longer navigates, shows no pointer cursor, and is not a tab stop. Before, a disabled editor's links acted as live links: a click or Enter opened them, and Tab stopped on each one.

@cixzhang
