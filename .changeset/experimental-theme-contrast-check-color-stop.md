---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the contrast check reads gradients, and `how` reads side nav section headings as the sections.

- Text on a gradient background is measured against each of its color stops, the worst one counting; a background with an image, or a stop with no fixed color, is listed as not checked.
- `how` reads "sidebar section headings" as the side nav's sections, whose title is drawn inside them, and says which inner parts an inherited text property also reaches.
- `how <part>` says what the part is, from its component's doc.

@josephfarina
