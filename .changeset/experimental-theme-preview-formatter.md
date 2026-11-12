---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: running prettier over the preview, with any options, no longer makes its files count as changed by hand. The check compares the code, not its formatting. An edit to code, a string or a comment still counts.

@josephfarina
