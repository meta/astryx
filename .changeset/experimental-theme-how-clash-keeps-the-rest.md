---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` no longer drops a whole description over one contradiction:

- Two clauses that set one thing two ways are offered as a choice. Every other clause is still answered and runs in order.
- A decimal value after a list is one value: "1.5 leading" is never a list's "1." marker.
- A color said for the whole theme ("silver #c0c0c0 everywhere", "white everywhere") takes its role, in the mode said with it ("red everywhere in dark mode"): a quiet color is the neutral, white or black the page, a strong color the accent.
- A bare size said before the type's own looks ("16px, 1.5 leading") is the text size, never a second leading.

@josephfarina
