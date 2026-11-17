---
'@astryxdesign/core': patch
---

[fix] A Toolbar with start and end content wraps when the two do not fit one row: the end content moves to the next line instead of squeezing the start content until its title wraps and its badge is cut. Each side keeps its controls on one line while it fits the toolbar's width, and a toolbar that fits its container looks the same as before. The kanban board template's header now fits a phone.

@josephfarina
