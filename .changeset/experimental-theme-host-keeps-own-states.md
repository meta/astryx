---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a part drawn on another part's element keeps its states to itself. A Button that a pagination cell is drawn on no longer takes the cell's `selected` state, so the button family reads the Button again and a selected look on a list row no longer reaches every Button; a part that always rides another (a list item on its Item) still takes that one's states.

@josephfarina
