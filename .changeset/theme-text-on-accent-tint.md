---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: text on a selected row or a selected preset keeps reading.

- A text color set on a selected part that holds other parts (a table row) also sets the primary and secondary text tokens there, so a checkbox label in the row follows it.
- Accent text set exactly that sits on the accent tint (a selected date-range preset) keeps reading: the tint takes the nearest stop, still a tint, under which it reads.

@josephfarina
