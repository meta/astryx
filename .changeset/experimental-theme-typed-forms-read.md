---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: more typed and pasted forms are read as meant. A part named beside a property's value (`set my padding 'card 8px'`, `'red on buttons'`, `'button:hover: red'`) gets the line on that part and state; the editor's own result line pasted with its head (`[ok] my: corners = pill (whole theme)`) is read; `new`'s settings written as pairs apart at commas (`'like: neutral, corners: pill'`) keep every pair; a base with a stray quote or comma (`--like "neutral'"`) gets its line without a did-you-mean for the same word; and a font family whose last word names a weight (`'Bodoni Moda Bold'`) is kept as typed with the family and weight lines in a note.

@josephfarina
