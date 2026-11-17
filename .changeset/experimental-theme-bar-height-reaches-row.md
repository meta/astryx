---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set`: a height (or a vertical padding) set on a bar, such as the app's header, reaches the row inside it, such as the top nav: the row fills the bar and gives up its own vertical padding, so its items sit in the middle of the bar instead of hanging below it. A value set on the row itself stays, `--only` keeps the height on the bar alone, and undo takes it all back. `set` and `show` name a part inside the row that is taller than the bar, with the line that makes it fit.

@josephfarina
