---
'@astryxdesign/core': patch
---

[fix] The slot that holds a checkbox's box or a radio's circle in CheckboxInput and RadioList is as big as the mark itself, instead of a fixed 20 or 24px. A theme that sizes the box (for example 13px) now gets the label right beside it and a pressed layer that fits it, where before the box floated in an empty 24px slot. The hidden input keeps its 20 or 24px hit area (at least 24px on touch screens), centered on the mark, and the focus ring stays on the mark. The shipped look is unchanged. A row is as tall as its mark or its label, whichever is taller: with a 13px box a default-size row goes from 24px to about 20px. A theme with a replacement indicator (`defineTheme({indicators})`) of another size sees its rows tighten: the label moves closer by (24 − size) / 2 px at the default size, the row is as tall as the mark or the label (the probe theme's 16px marks: 24px to about 22px), and the pressed layer matches the mark. A Markdown task item drawn in its list's marker column keeps its checkbox centered on the item's first line at any box size.

@josephfarina
