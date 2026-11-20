---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how`: a list piece that is only a named color with a hue, with no look, part, role or variant word of its own, said after a part that draws with the accent, such as a button or a checkbox, is now the theme's accent ("big buttons, a sky blue, high contrast", "rounded checkboxes, navy", "bigger buttons, green, bold headings"). A typed value there ("bigger buttons, #2563eb") is still not used. As before, white, black or a gray after such a part is its fill ("rounder buttons, white", "rounded checkboxes, white", "rounder progress bars, white" on the bar's fill); after a part that is only text, or one with a plain fill, the color is that part's text or fill ("bold headings, dark gray", "rounder cards, white"); after any other part ("bigger icons, red") the color reads as it did; and a piece that names a role or variant ("red and blue accents", "primary blue") is read by the role and variant readers.

@josephfarina
