---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` draws a recharts chart sized by its `ResponsiveContainer` at a set of widths, from a narrow table cell to a wide screen, and the file's CSS shows the drawing nearest the width the reader's browser gives the chart, with no script. Before, such a chart was drawn once at a guessed size and stretched to the page's width: its text was about one and a half times its size on a desktop and half its size on a phone, and a chart that filled a box of fixed height ran out of the box. The chart now keeps the height the page gives it (a number, the width over `aspect`, or its share of the height that the box it fills states in its style), fits that box whole, and its text stays within a fifth of its own size. Its legend sits inside its picture, where recharts places it. Each such chart carries eleven drawings, whose coordinates keep two decimal places, so a page of such charts takes about two to three times the room it took. A chart of fixed size is drawn as before.

@josephfarina
