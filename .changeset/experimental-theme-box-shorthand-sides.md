---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set` takes a box color shorthand with one color per side, as CSS does: `border-color` with 2 to 4 colors (`#ddd #ddd transparent`), and `border-block-color` or `border-inline-color` with 2. The value is built as typed, in both modes or one, and each side is measured on its own: a faint side is named ("the bottom border on text-input"), a transparent side is left out, and the fix keeps the other sides as typed. Too many colors, or a side that is no color, is refused with the reason.

@josephfarina
