---
'@astryxdesign/core': patch
---

[feat] Table: the row-expansion toggle resolves its glyph through the `table-row-expand` component icon slot with state `{expanded}`. With no theme entry it draws `chevronRight`, as before. The toggle still turns the glyph a quarter turn while expanded and mirrors it in right-to-left layouts, whatever the slot resolves. A theme maps it with `defineTheme({componentIcons: {'table-row-expand': …}})`; `null` hides only the glyph, and the toggle keeps its name, `aria-expanded`, and its toggling.

@imdreamrunner
