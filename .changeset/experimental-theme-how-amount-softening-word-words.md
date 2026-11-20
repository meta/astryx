---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` now reads these asks the way they are said:

- **Amounts with a softening word go the right way:** "three times as soft" is a third of now and "half as soft" is twice as strong. "Corners half as small" makes them twice the size.
- **"Exactly 36px high"** is a height of 36px.
- **"…and the text bigger"** changes the theme's text, not the part named before it.
- **A border color on a part** keeps only the colors Core gives a status or focus. It no longer pins every variant back to its old color, so the new color shows on every variant.
- **A part made more transparent or fainter** moves from what it shows now: a disabled button's 0.5 opacity goes lower, never higher. Each variant's fill fades from its own color, in the state asked, and the part never gets a line it does not draw.

@josephfarina
