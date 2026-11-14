---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render --reverse` names the file and line of a changed text that wraps across lines in the source, as JSX text often does, and of a text longer than the part a change shows. Such a change was listed without a place, although its old text appears once in the restored source.

@josephfarina
